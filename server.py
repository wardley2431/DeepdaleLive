from __future__ import annotations

import json
import mimetypes
import os
import random
import secrets
import threading
import time
import uuid
from copy import deepcopy
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
DATA_DIR = Path(os.environ.get("CLASSROOM_DATA_DIR", ROOT / "data"))
STATE_FILE = DATA_DIR / "state.json"

MAX_QUESTIONS = 40
MAX_ANSWERS = 6
STATE_VERSION = 1

LOCK = threading.RLock()
QUIZZES: dict[str, dict[str, Any]] = {}
SESSIONS: dict[str, dict[str, Any]] = {}


class ApiError(Exception):
    def __init__(self, status: HTTPStatus, message: str) -> None:
        self.status = status
        self.message = message
        super().__init__(message)


def now_ms() -> int:
    return int(time.time() * 1000)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def clamp_int(value: Any, minimum: int, maximum: int, default: int) -> int:
    try:
        numeric = int(float(value))
    except (TypeError, ValueError):
        numeric = default
    return max(minimum, min(maximum, numeric))


def clean_text(value: Any, default: str, limit: int) -> str:
    text = str(value or "").strip()
    return (text or default)[:limit]


def default_quiz() -> dict[str, Any]:
    return normalize_quiz(
        {
            "id": "starter_check",
            "title": "Starter Check",
            "description": "A quick classroom readiness quiz.",
            "questions": [
                {
                    "text": "Which number is a prime number?",
                    "timeLimitSeconds": 20,
                    "points": 1000,
                    "answers": [
                        {"text": "21", "correct": False},
                        {"text": "29", "correct": True},
                        {"text": "35", "correct": False},
                        {"text": "39", "correct": False},
                    ],
                },
                {
                    "text": "What should a learner do before submitting group work?",
                    "timeLimitSeconds": 25,
                    "points": 1000,
                    "answers": [
                        {"text": "Check the rubric", "correct": True},
                        {"text": "Close the tab", "correct": False},
                        {"text": "Rename everyone", "correct": False},
                        {"text": "Skip the sources", "correct": False},
                    ],
                },
                {
                    "text": "Which item is usually renewable energy?",
                    "timeLimitSeconds": 20,
                    "points": 1000,
                    "answers": [
                        {"text": "Coal", "correct": False},
                        {"text": "Natural gas", "correct": False},
                        {"text": "Solar power", "correct": True},
                        {"text": "Diesel", "correct": False},
                    ],
                },
            ],
        }
    )


def normalize_quiz(raw: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ApiError(HTTPStatus.BAD_REQUEST, "Quiz payload must be an object.")

    raw_questions = raw.get("questions", [])
    if not isinstance(raw_questions, list) or not raw_questions:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Add at least one question.")
    if len(raw_questions) > MAX_QUESTIONS:
        raise ApiError(HTTPStatus.BAD_REQUEST, f"Use {MAX_QUESTIONS} questions or fewer.")

    quiz_id = clean_text(raw.get("id"), new_id("quiz"), 80)
    quiz = {
        "id": quiz_id,
        "title": clean_text(raw.get("title"), "Untitled Quiz", 120),
        "description": clean_text(raw.get("description"), "", 240),
        "questions": [],
        "updatedAt": now_ms(),
    }

    for question_index, raw_question in enumerate(raw_questions):
        if not isinstance(raw_question, dict):
            raise ApiError(HTTPStatus.BAD_REQUEST, "Each question must be an object.")
        question = normalize_question(raw_question, question_index)
        quiz["questions"].append(question)

    return quiz


def normalize_question(raw: dict[str, Any], question_index: int) -> dict[str, Any]:
    raw_answers = raw.get("answers", [])
    if not isinstance(raw_answers, list):
        raise ApiError(HTTPStatus.BAD_REQUEST, "Question answers must be a list.")

    answers: list[dict[str, Any]] = []
    for answer_index, raw_answer in enumerate(raw_answers[:MAX_ANSWERS]):
        if not isinstance(raw_answer, dict):
            continue
        answer_text = str(raw_answer.get("text", "")).strip()
        if not answer_text:
            continue
        answers.append(
            {
                "id": clean_text(raw_answer.get("id"), f"a{answer_index + 1}", 40),
                "text": answer_text[:180],
                "correct": bool(raw_answer.get("correct", False)),
            }
        )

    if len(answers) < 2:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Each question needs at least two answer choices.")
    if not any(answer["correct"] for answer in answers):
        answers[0]["correct"] = True

    return {
        "id": clean_text(raw.get("id"), f"q{question_index + 1}", 40),
        "text": clean_text(raw.get("text"), f"Question {question_index + 1}", 260),
        "timeLimitSeconds": clamp_int(raw.get("timeLimitSeconds"), 5, 120, 30),
        "points": clamp_int(raw.get("points"), 100, 2000, 1000),
        "answers": answers,
    }


def load_state() -> None:
    with LOCK:
        QUIZZES.clear()
        SESSIONS.clear()
        if STATE_FILE.exists():
            try:
                state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
                if isinstance(state.get("quizzes"), dict):
                    QUIZZES.update(state["quizzes"])
                if isinstance(state.get("sessions"), dict):
                    SESSIONS.update(state["sessions"])
            except (OSError, json.JSONDecodeError) as exc:
                print(f"Could not load saved classroom state: {exc}")

        starter = default_quiz()
        QUIZZES.setdefault(starter["id"], starter)


def save_state() -> None:
    with LOCK:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": STATE_VERSION,
            "quizzes": QUIZZES,
            "sessions": SESSIONS,
        }
        tmp_file = STATE_FILE.with_suffix(".tmp")
        tmp_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        os.replace(tmp_file, STATE_FILE)


def make_pin() -> str:
    active_pins = {session["pin"] for session in SESSIONS.values() if session["phase"] != "finished"}
    for _ in range(100):
        pin = f"{random.randint(0, 999999):06d}"
        if pin not in active_pins:
            return pin
    raise ApiError(HTTPStatus.CONFLICT, "Could not allocate a session PIN.")


def find_session_by_pin(pin: str) -> dict[str, Any]:
    clean_pin = "".join(character for character in str(pin) if character.isdigit())[:6]
    for session in SESSIONS.values():
        if session["pin"] == clean_pin and session["phase"] != "finished":
            return session
    raise ApiError(HTTPStatus.NOT_FOUND, "Session PIN was not found.")


def session_question(session: dict[str, Any]) -> dict[str, Any] | None:
    index = session.get("questionIndex", -1)
    questions = session["quiz"]["questions"]
    if not isinstance(index, int) or index < 0 or index >= len(questions):
        return None
    return questions[index]


def time_remaining_ms(session: dict[str, Any]) -> int:
    question = session_question(session)
    if not question or session["phase"] != "question" or not session.get("roundStartedAt"):
        return 0
    deadline = int(session["roundStartedAt"]) + int(question["timeLimitSeconds"]) * 1000
    return max(0, deadline - now_ms())


def answer_records(session: dict[str, Any], question_index: int | None = None) -> dict[str, Any]:
    index = session.get("questionIndex", -1) if question_index is None else question_index
    return session.setdefault("answers", {}).setdefault(str(index), {})


def current_stats(session: dict[str, Any]) -> dict[str, Any]:
    question = session_question(session)
    if not question:
        return {"counts": [], "totalAnswers": 0, "correctAnswers": 0}

    counts = [0 for _ in question["answers"]]
    correct_answers = 0
    records = answer_records(session)
    for record in records.values():
        answer_index = record.get("answerIndex")
        if isinstance(answer_index, int) and 0 <= answer_index < len(counts):
            counts[answer_index] += 1
        if record.get("correct"):
            correct_answers += 1
    return {
        "counts": counts,
        "totalAnswers": len(records),
        "correctAnswers": correct_answers,
    }


def leaderboard(session: dict[str, Any], limit: int | None = None) -> list[dict[str, Any]]:
    players = [
        {
            "id": player["id"],
            "name": player["name"],
            "score": int(player.get("score", 0)),
            "joinedAt": int(player.get("joinedAt", 0)),
        }
        for player in session.get("players", {}).values()
    ]
    players.sort(key=lambda item: (-item["score"], item["joinedAt"], item["name"].lower()))
    if limit:
        return players[:limit]
    return players


def question_for_view(question: dict[str, Any], reveal: bool) -> dict[str, Any]:
    return {
        "id": question["id"],
        "text": question["text"],
        "timeLimitSeconds": question["timeLimitSeconds"],
        "points": question["points"],
        "answers": [
            {
                "id": answer["id"],
                "text": answer["text"],
                **({"correct": answer["correct"]} if reveal else {}),
            }
            for answer in question["answers"]
        ],
    }


def snapshot_session(
    session: dict[str, Any],
    view: str = "public",
    player_id: str | None = None,
    host_token: str | None = None,
) -> dict[str, Any]:
    phase = session["phase"]
    is_host = view == "host" and host_token == session.get("hostToken")
    reveal_answers = is_host or phase in {"reveal", "finished"}
    question = session_question(session)
    player = session.get("players", {}).get(player_id or "")
    player_answer = None
    if player and question:
        player_answer = answer_records(session).get(player["id"])

    players = []
    if is_host:
        records = answer_records(session) if question else {}
        players = [
            {
                "id": item["id"],
                "name": item["name"],
                "score": int(item.get("score", 0)),
                "answered": item["id"] in records,
            }
            for item in session.get("players", {}).values()
        ]
        players.sort(key=lambda item: item["name"].lower())

    return {
        "id": session["id"],
        "pin": session["pin"],
        "phase": phase,
        "quizTitle": session["quiz"]["title"],
        "questionIndex": session.get("questionIndex", -1),
        "totalQuestions": len(session["quiz"]["questions"]),
        "playerCount": len(session.get("players", {})),
        "serverTime": now_ms(),
        "timeRemainingMs": time_remaining_ms(session),
        "question": question_for_view(question, reveal_answers) if question else None,
        "stats": current_stats(session) if question else None,
        "players": players,
        "leaderboard": leaderboard(session, None if is_host else 5),
        "player": player,
        "playerAnswer": player_answer,
        "host": {
            "joinUrl": f"/play?pin={session['pin']}",
            "hostUrl": f"/host?session={session['id']}&token={session['hostToken']}",
        }
        if is_host
        else None,
    }


def create_session(payload: dict[str, Any]) -> dict[str, Any]:
    if "quizId" in payload:
        quiz_id = str(payload["quizId"])
        quiz = QUIZZES.get(quiz_id)
        if not quiz:
            raise ApiError(HTTPStatus.NOT_FOUND, "Quiz was not found.")
        quiz = deepcopy(quiz)
    else:
        quiz = normalize_quiz(payload.get("quiz", {}))

    session_id = new_id("session")
    session = {
        "id": session_id,
        "pin": make_pin(),
        "hostToken": secrets.token_urlsafe(20),
        "phase": "lobby",
        "quiz": quiz,
        "questionIndex": -1,
        "roundStartedAt": None,
        "roundClosedAt": None,
        "players": {},
        "answers": {},
        "createdAt": now_ms(),
        "updatedAt": now_ms(),
    }
    SESSIONS[session_id] = session
    save_state()
    return session


def require_session(session_id: str) -> dict[str, Any]:
    session = SESSIONS.get(session_id)
    if not session:
        raise ApiError(HTTPStatus.NOT_FOUND, "Session was not found.")
    return session


def require_host(session: dict[str, Any], token: str | None) -> None:
    if token != session.get("hostToken"):
        raise ApiError(HTTPStatus.FORBIDDEN, "Host token is missing or invalid.")


def join_session(session: dict[str, Any], name: Any) -> dict[str, Any]:
    if session["phase"] == "finished":
        raise ApiError(HTTPStatus.CONFLICT, "This session has finished.")
    player_name = clean_text(name, "Learner", 40)
    player_id = new_id("player")
    player = {
        "id": player_id,
        "name": player_name,
        "score": 0,
        "joinedAt": now_ms(),
    }
    session["players"][player_id] = player
    session["updatedAt"] = now_ms()
    save_state()
    return player


def start_round(session: dict[str, Any]) -> None:
    if session["phase"] == "finished":
        raise ApiError(HTTPStatus.CONFLICT, "This session has already finished.")
    session["questionIndex"] = 0
    session["phase"] = "question"
    session["roundStartedAt"] = now_ms()
    session["roundClosedAt"] = None
    session["updatedAt"] = now_ms()
    session.setdefault("answers", {}).setdefault("0", {})
    save_state()


def reveal_round(session: dict[str, Any]) -> None:
    if session["phase"] not in {"question", "reveal"}:
        raise ApiError(HTTPStatus.CONFLICT, "There is no active question to reveal.")
    session["phase"] = "reveal"
    session["roundClosedAt"] = now_ms()
    session["updatedAt"] = now_ms()
    save_state()


def next_round(session: dict[str, Any]) -> None:
    if session["phase"] == "lobby":
        start_round(session)
        return
    if session["phase"] == "finished":
        raise ApiError(HTTPStatus.CONFLICT, "This session has already finished.")
    next_index = int(session.get("questionIndex", -1)) + 1
    if next_index >= len(session["quiz"]["questions"]):
        finish_session(session)
        return
    session["questionIndex"] = next_index
    session["phase"] = "question"
    session["roundStartedAt"] = now_ms()
    session["roundClosedAt"] = None
    session["updatedAt"] = now_ms()
    session.setdefault("answers", {}).setdefault(str(next_index), {})
    save_state()


def finish_session(session: dict[str, Any]) -> None:
    session["phase"] = "finished"
    session["roundClosedAt"] = now_ms()
    session["updatedAt"] = now_ms()
    save_state()


def submit_answer(session: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    player_id = str(payload.get("playerId", ""))
    player = session.get("players", {}).get(player_id)
    if not player:
        raise ApiError(HTTPStatus.NOT_FOUND, "Player was not found.")
    if session["phase"] != "question":
        raise ApiError(HTTPStatus.CONFLICT, "Answers are not open right now.")
    if time_remaining_ms(session) <= 0:
        raise ApiError(HTTPStatus.CONFLICT, "The question timer has expired.")

    question = session_question(session)
    if not question:
        raise ApiError(HTTPStatus.CONFLICT, "No active question.")

    records = answer_records(session)
    if player_id in records:
        return records[player_id]

    answer_index = clamp_int(payload.get("answerIndex"), 0, len(question["answers"]) - 1, 0)
    answer = question["answers"][answer_index]
    elapsed = max(0, now_ms() - int(session["roundStartedAt"]))
    limit_ms = max(1, int(question["timeLimitSeconds"]) * 1000)
    remaining_fraction = max(0.0, 1.0 - (elapsed / limit_ms))
    is_correct = bool(answer["correct"])
    score = int(question["points"] * (0.5 + 0.5 * remaining_fraction)) if is_correct else 0

    record = {
        "playerId": player_id,
        "answerIndex": answer_index,
        "correct": is_correct,
        "score": score,
        "responseMs": elapsed,
        "answeredAt": now_ms(),
    }
    records[player_id] = record
    player["score"] = int(player.get("score", 0)) + score
    session["updatedAt"] = now_ms()
    save_state()
    return record


class ClassroomHandler(BaseHTTPRequestHandler):
    server_version = "ClassPulse/0.1"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        query = parse_qs(parsed.query)
        try:
            if path == "/api/health":
                self.send_json({"status": "ok", "time": now_ms()})
                return
            if path == "/api/quizzes":
                self.handle_list_quizzes()
                return
            if path.startswith("/api/quizzes/"):
                self.handle_get_quiz(path)
                return
            if path.startswith("/api/sessions/pin/"):
                self.handle_get_pin(path)
                return
            if path.startswith("/api/sessions/"):
                self.handle_get_session(path, query)
                return
            self.serve_static(path)
        except ApiError as exc:
            self.send_json({"error": exc.message}, status=exc.status)
        except Exception as exc:  # pragma: no cover - defensive HTTP boundary
            self.send_json({"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        try:
            if path == "/api/quizzes":
                self.handle_create_quiz()
                return
            if path == "/api/sessions":
                self.handle_create_session()
                return
            if path == "/api/join":
                self.handle_join_by_pin()
                return
            if path.startswith("/api/sessions/"):
                self.handle_session_action(path)
                return
            self.send_json({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)
        except ApiError as exc:
            self.send_json({"error": exc.message}, status=exc.status)
        except Exception as exc:  # pragma: no cover - defensive HTTP boundary
            self.send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def handle_list_quizzes(self) -> None:
        with LOCK:
            quizzes = [
                {
                    "id": quiz["id"],
                    "title": quiz["title"],
                    "description": quiz.get("description", ""),
                    "questionCount": len(quiz.get("questions", [])),
                    "updatedAt": quiz.get("updatedAt", 0),
                }
                for quiz in QUIZZES.values()
            ]
        quizzes.sort(key=lambda item: item["title"].lower())
        self.send_json({"quizzes": quizzes})

    def handle_get_quiz(self, path: str) -> None:
        quiz_id = path.strip("/").split("/", 2)[2]
        with LOCK:
            quiz = QUIZZES.get(quiz_id)
            if not quiz:
                raise ApiError(HTTPStatus.NOT_FOUND, "Quiz was not found.")
            self.send_json({"quiz": quiz})

    def handle_create_quiz(self) -> None:
        payload = self.read_json()
        quiz = normalize_quiz(payload)
        with LOCK:
            QUIZZES[quiz["id"]] = quiz
            save_state()
        self.send_json({"quiz": quiz}, status=HTTPStatus.CREATED)

    def handle_create_session(self) -> None:
        payload = self.read_json()
        with LOCK:
            session = create_session(payload)
            snapshot = snapshot_session(session, view="host", host_token=session["hostToken"])
        self.send_json(
            {
                "sessionId": session["id"],
                "pin": session["pin"],
                "hostToken": session["hostToken"],
                "hostUrl": f"/host?session={session['id']}&token={session['hostToken']}",
                "joinUrl": f"/play?pin={session['pin']}",
                "session": snapshot,
            },
            status=HTTPStatus.CREATED,
        )

    def handle_get_pin(self, path: str) -> None:
        pin = path.strip("/").split("/", 3)[3]
        with LOCK:
            session = find_session_by_pin(pin)
            self.send_json({"session": snapshot_session(session)})

    def handle_get_session(self, path: str, query: dict[str, list[str]]) -> None:
        parts = path.strip("/").split("/")
        if len(parts) != 3:
            raise ApiError(HTTPStatus.NOT_FOUND, "Session was not found.")
        session_id = parts[2]
        view = query.get("view", ["public"])[0]
        token = query.get("token", [None])[0]
        player_id = query.get("playerId", [None])[0]
        with LOCK:
            session = require_session(session_id)
            if view == "host":
                require_host(session, token)
            self.send_json({"session": snapshot_session(session, view=view, player_id=player_id, host_token=token)})

    def handle_join_by_pin(self) -> None:
        payload = self.read_json()
        with LOCK:
            session = find_session_by_pin(payload.get("pin", ""))
            player = join_session(session, payload.get("name"))
            snapshot = snapshot_session(session, view="player", player_id=player["id"])
        self.send_json({"player": player, "session": snapshot}, status=HTTPStatus.CREATED)

    def handle_session_action(self, path: str) -> None:
        parts = path.strip("/").split("/")
        if len(parts) != 4:
            raise ApiError(HTTPStatus.NOT_FOUND, "Action was not found.")
        _, _, session_id, action = parts
        payload = self.read_json()
        with LOCK:
            session = require_session(session_id)
            if action == "join":
                player = join_session(session, payload.get("name"))
                snapshot = snapshot_session(session, view="player", player_id=player["id"])
                self.send_json({"player": player, "session": snapshot}, status=HTTPStatus.CREATED)
                return
            if action == "answer":
                record = submit_answer(session, payload)
                snapshot = snapshot_session(session, view="player", player_id=str(payload.get("playerId", "")))
                self.send_json({"answer": record, "session": snapshot})
                return

            require_host(session, str(payload.get("hostToken", "")))
            if action == "start":
                start_round(session)
            elif action == "reveal":
                reveal_round(session)
            elif action == "next":
                next_round(session)
            elif action == "finish":
                finish_session(session)
            else:
                raise ApiError(HTTPStatus.NOT_FOUND, "Action was not found.")
            self.send_json({"session": snapshot_session(session, view="host", host_token=session["hostToken"])})

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 1_000_000:
            raise ApiError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Payload is too large.")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ApiError(HTTPStatus.BAD_REQUEST, "Payload must be valid JSON.") from exc
        if not isinstance(payload, dict):
            raise ApiError(HTTPStatus.BAD_REQUEST, "Payload must be an object.")
        return payload

    def serve_static(self, path: str) -> None:
        if path in {"", "/"} or not Path(path).suffix:
            path = "/index.html"
        requested = (STATIC_DIR / path.lstrip("/")).resolve()
        static_root = STATIC_DIR.resolve()
        try:
            requested.relative_to(static_root)
        except ValueError:
            self.send_error(HTTPStatus.FORBIDDEN, "Forbidden")
            return
        if not requested.exists() or not requested.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        content_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream"
        content = requested.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}")


def parse_args() -> tuple[str, int]:
    host = os.environ.get("CLASSROOM_HOST", "127.0.0.1")
    port = int(os.environ.get("CLASSROOM_PORT", "8000"))
    return host, port


def run(host: str = "127.0.0.1", port: int = 8000) -> None:
    load_state()
    server = ThreadingHTTPServer((host, port), ClassroomHandler)
    print(f"ClassPulse running at http://{host}:{port}")
    print(f"State file: {STATE_FILE}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    run(*parse_args())
