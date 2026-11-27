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
    container_name: homelab-backups-backend
    # Uncomment to debug the API directly
    # ports:
    #   - "8686:8686"
    volumes:
      - ${BACKUP_SOURCE}:/app/source:ro
      - ${BACKUP_DESTINATION}:/app/destination
      - ${APP_DB_PATH}:/app/data
    environment:
      - TZ=${TZ:-Etc/UTC}
    restart: unless-stopped
  frontend:
    image: jonymaster/homelab-backups-frontend:latest
    container_name: homelab-backups-frontend
    ports:
      - "3000:3000"
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
```

Alternatively, you can download the project and build it.

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
    BACKUP_DESTINATION=/path/to/backup/destination
    APP_DB_PATH=/path/to/app/db
    TZ=Etc/UTC
    ```

    As a security best practice, avoid to map ```"/"``` as ```BACKUP_SOURCE```.

    ```BACKUP_DESTINATION``` should be something external such as ```/mnt/media/backups```

3. Deploy:

    ```bash
    cd docker
    docker compose up -d
    ```

4. Access dashboard at ```http://localhost:3000```

## Volumes and permissions

The backend runs as a non-root user (UID/GID 1000). ```BACKUP_DESTINATION``` and ```APP_DB_PATH``` must be writable by it:

```bash
sudo chown -R 1000:1000 /path/to/backup/destination /path/to/app/db
```

```BACKUP_SOURCE``` is mounted read-only and only needs to be readable.

License
MIT License - See LICENSE file
