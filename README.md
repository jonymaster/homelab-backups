# Homelab Backups

A webapp built with Next.js and FastAPI as a backend for scheduling, editing and managing rdiff jobs for your homelab server.

## Notes

This is my very first fullstack project and it's in constant development. Any contribution is kindly welcomed.

At the moment the app works for local backups, a next development should enable ssh authentication and let the user to schedule rdiff jobs with remote destinations

## Docker compose

You can use the following docker compose since the images are public. Refer to the step below for the .env example file

    ```yaml
    services:
    backend:
        image: jonymaster/homelab-backups-backend:latest
        container_name: homelab-backups-api
        ports:
        - "8686:8686"
        volumes:
        - ${BACKUP_SOURCE}:/app/source:ro
        - ${BACKUP_DESTINATION}:/app/destination
        - ${APP_DB_PATH}:/app/data
        - /etc/localtime:/etc/localtime:ro
        environment:
        - TZ=Europe/Paris
        - SERVER_IP=${BACKEND_IP}
        restart: unless-stopped
    frontend:
        image: jonymaster/homelab-backups-frontend:latest
        container_name: homelab-backups-frontend
        ports:
        - "3000:3000"
        environment:
        - NEXT_PUBLIC_SERVER_IP=${BACKEND_IP}
        depends_on:
        - backend
        restart: unless-stopped
    ```

Altenatevly, you can download the project and build it.

## Quick Start

1. Clone and setup:

    ```bash
    git clone https://github.com/jonymaster/homelab-backups.git
    cd homelab-backups
    cp docker/.env.example docker/.env
    ```

2. Configure environment:

    ```bash
    BACKUP_SOURCE=/path/to/backup/source
    BACKUP_DEST=/path/to/backup/destination
    APP_DB_PATH=/path/to/app/db
    BACKEND_IP=localhost
    ```

    As a security best practice, avoid to map ```"/"``` as ```BACKUP_SOURCE```.

    ```BACKUP_DEST``` should be something external such as ```/mnt/media/backups```

3. Deploy:

    ```bash
    cd docker
    docker compose up -d
    ```

4. Access dashboard at ```http://localhost:3000```

    License
    MIT License - See LICENSE file
