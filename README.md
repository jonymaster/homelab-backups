# Homelab Backups

A webapp built with Next.js and FastAPI as a backend for scheduling, editing and managing rdiff jobs for your homelab server.

## Notes

This is my very first fullstack project and it's in constant development. Any contribution is kindly welcomed.

At the moment the app works for local backups, a next development should enable ssh authentication and let the user to schedule rdiff jobs with remote destinations

## Quick Start

1. Clone and setup:

    ```bash
    git clone https://github.com/yourusername/homelab-backups.git
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

3. Deploy:

    ```bash
    cd docker
    docker compose up -d
    ```

4. Access dashboard at ```http://localhost:3000```

    License
    MIT License - See LICENSE file
