# DeepdaleLive / ClassPulse Offline VM Guide

DeepdaleLive is a standalone classroom quiz platform. A teacher creates a live quiz room, learners join with a PIN, and answers/scores update in the browser.

This guide is written for running it inside a virtual machine or Raspberry Pi environment that has Docker installed but does not have internet access.

## What The App Needs

At runtime the app does not need the internet.

The Python code only uses built-in Python libraries. There is no `pip install`, no database, and no cloud service.

Docker only needs a Python base image to exist locally on the machine. The default image is:

```text
python:3.13-slim
```

If that image is not already available on the offline machine, you must transfer it from another machine that has internet access.

## Required Folder Layout

Put the project somewhere your user owns, for example:

```text
/home/pi/DeepdaleLive
```

or:

```text
/home/YOUR_USERNAME/DeepdaleLive
```

The folder must look like this:

```text
DeepdaleLive/
  Dockerfile
  docker-compose.yml
  server.py
  static/
    index.html
    app.js
    styles.css
```

`README.md`, `.gitignore`, `.dockerignore`, and `start.ps1` are useful but not required for the app to run.

Do not put the project in:

```text
/root
/app
/usr
/etc
```

Use your home folder instead.

## Check Docker Is Available

On the VM:

```bash
docker --version
docker compose version
docker ps
```

If `docker ps` says permission denied, your user is probably not in the Docker group.

If you have sudo access:

```bash
sudo usermod -aG docker $USER
sudo reboot
```

After reboot:

```bash
docker ps
```

## Check Whether The Python Image Already Exists

On the offline VM:

```bash
docker images
```

Look for one of these:

```text
python   3.13-slim
python   3.12-slim
python   3.11-slim
```

If `python:3.13-slim` exists, use the Dockerfile as-is.

If only another Python version exists, edit the first line of `Dockerfile`.

For example:

```dockerfile
FROM python:3.12-slim
```

or:

```dockerfile
FROM python:3.11-slim
```

The app should work on Python 3.11, 3.12, or 3.13.

## If The VM Does Not Have The Python Image

Use another computer that has internet access.

On the internet-connected computer:

```bash
docker pull python:3.13-slim
docker save python:3.13-slim -o python-3.13-slim.tar
```

Copy `python-3.13-slim.tar` to the offline VM using USB, shared folder, SCP, or whatever file transfer method is available.

On the offline VM:

```bash
docker load -i python-3.13-slim.tar
docker images
```

You should now see:

```text
python   3.13-slim
```

## Build And Start The App

Go into the project folder:

```bash
cd ~/DeepdaleLive
```

Check the files are in the right place:

```bash
pwd
ls -la
ls -la static
```

You should see `server.py` in the same folder as `Dockerfile`.

Then build and start:

```bash
docker compose up -d --build
```

Check it is running:

```bash
docker ps
```

You should see a container named:

```text
classpulse
```

with a port mapping like:

```text
0.0.0.0:8000->8000/tcp
```

## Open The App

From inside the VM, try:

```text
http://127.0.0.1:8000
```

From another machine on the same network, use the VM or Raspberry Pi IP address:

```text
http://VM-IP-ADDRESS:8000
```

To find the IP:

```bash
hostname -I
```

Example:

```text
http://192.168.1.42:8000
```

## Stop, Start, And Logs

Stop the app:

```bash
docker compose stop
```

Start it again:

```bash
docker compose start
```

Restart it:

```bash
docker compose restart
```

View logs:

```bash
docker compose logs -f
```

## Updating Files Without Internet

Copy the updated project files into the same `DeepdaleLive` directory.

Then run:

```bash
cd ~/DeepdaleLive
docker compose up -d --build
```

If you only changed files inside `static/`, a browser refresh may be enough, but rebuilding is the safest option.

## Alternative: Run With Mounted Files

If you are still editing and testing often, you can use a Compose file that mounts the folder into the container. This avoids rebuilding for every file change.

Replace `docker-compose.yml` with:

```yaml
services:
  classpulse:
    image: python:3.13-slim
    container_name: classpulse
    restart: unless-stopped
    working_dir: /app
    command: python server.py
    ports:
      - "8000:8000"
    environment:
      CLASSROOM_HOST: 0.0.0.0
      CLASSROOM_PORT: 8000
      CLASSROOM_DATA_DIR: /data
    volumes:
      - ./:/app
      - classpulse-data:/data

volumes:
  classpulse-data:
```

Then start:

```bash
docker compose up -d
```

If you edit `server.py`, restart:

```bash
docker compose restart
```

If you edit `static/index.html`, `static/app.js`, or `static/styles.css`, refresh the browser.

## Common Problems

### `server.py cannot be found`

You are probably running Docker from the wrong folder, or the files are nested one level too deep.

Run:

```bash
find ~ -name "server.py" -o -name "Server.py"
pwd
ls -la
```

Correct:

```text
/home/pi/DeepdaleLive/server.py
/home/pi/DeepdaleLive/Dockerfile
/home/pi/DeepdaleLive/docker-compose.yml
```

Wrong:

```text
/home/pi/DeepdaleLive/DeepdaleLive/server.py
```

If it is nested, either run Docker from the inner folder:

```bash
cd ~/DeepdaleLive/DeepdaleLive
docker compose up -d --build
```

or move the files up.

### Docker Tries To Download From The Internet

That means the required image is not already loaded.

Check:

```bash
docker images
```

If `python:3.13-slim` is missing, transfer it with:

```bash
docker save
docker load
```

as described above.

### Port 8000 Is Already In Use

Edit `docker-compose.yml` and change the left side of the port mapping:

```yaml
ports:
  - "8010:8000"
```

Then:

```bash
docker compose up -d --build
```

Open:

```text
http://VM-IP-ADDRESS:8010
```

### Permission Denied In Project Folder

Put the project in your home folder:

```bash
mkdir -p ~/DeepdaleLive
```

Avoid `/root`, `/app`, or system folders.

### Need A Clean Reset

This removes the container and rebuilds it. It does not remove the saved Docker volume unless you ask Docker to remove volumes.

```bash
cd ~/DeepdaleLive
docker compose down
docker compose up -d --build
```

To remove saved quiz/session data too:

```bash
docker compose down -v
docker compose up -d --build
```

## How To Use The Platform

1. Open the site as the host.
2. Build a quiz or load a saved lesson from the question bank.
3. Click Create Session.
4. Share the six-digit PIN.
5. Learners open the same address and join with the PIN.
6. Host starts the quiz.
7. Learners answer questions.
8. Host reveals results and moves to the next question.

Everything runs locally inside the VM/container.

## Question Bank

The host screen includes a reusable question bank.

Each saved lesson has:

```text
Module: 1, 2, 3, 4, or 5
Lesson title: for example "Norman Conquest"
Questions and answers
```

To save questions for reuse:

1. Open the host screen.
2. Choose the module.
3. Enter the lesson title.
4. Enter or edit the quiz questions.
5. Click Save To Bank.

To reuse a lesson later:

1. Open the host screen.
2. Pick the lesson from Saved lesson.
3. Click Load Lesson.
4. Click Create Session when ready.

To delete an accidental saved lesson:

1. Open the host screen.
2. Pick the lesson from Saved lesson.
3. Click Delete Lesson.
4. Confirm the browser prompt.

The built-in starter quiz cannot be deleted.

The question bank is stored in the same local JSON state file as the rest of the app.

In Docker this is stored in the `classpulse-data` volume by default:

```text
/data/state.json
```

If you run without Docker, it is stored in:

```text
data/state.json
```

If you run:

```bash
docker compose down -v
```

Docker removes the saved volume, so the question bank will be deleted too. Use:

```bash
docker compose down
```

if you want to stop containers but keep saved questions.
