#!/bin/bash

# Variables
SERVICE_NAME="homelab-backup"
APP_DIR="/home/$USER/projects/homelab-backups"
VENV_DIR="$APP_DIR/venv"
PYTHON_EXEC="/usr/bin/python3"
PIP_EXEC="/usr/bin/pip3"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

# Update package list and install required packages
sudo apt update
sudo apt install -y python3 python3-pip python3-venv

# Create project directory if it doesn't exist
mkdir -p $APP_DIR

# Navigate to project directory
cd $APP_DIR

# Create a virtual environment
$PYTHON_EXEC -m venv $VENV_DIR

# Activate the virtual environment and install packages
source $VENV_DIR/bin/activate
$VENV_DIR/bin/pip install fastapi uvicorn sqlalchemy

# Create the systemd service file
sudo bash -c "cat > $SERVICE_FILE" <<EOL
[Unit]
Description=Homelab Backup FastAPI Service
After=network.target

[Service]
User=$USER
WorkingDirectory=$APP_DIR
Environment='PATH=$VENV_DIR/bin'
ExecStart=$VENV_DIR/bin/uvicorn main:app --host 0.0.0.0 --port 8686
Restart=always

[Install]
WantedBy=multi-user.target
EOL

# Reload systemd daemon to recognize new service
sudo systemctl daemon-reload

# Enable and start the service
sudo systemctl enable $SERVICE_NAME
sudo systemctl start $SERVICE_NAME

# Check service status
systemctl status $SERVICE_NAME