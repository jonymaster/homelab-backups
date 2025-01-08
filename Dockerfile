# Use the official Python base image with Python 3.10
FROM python:3.10-slim

# Install tini and other dependencies
RUN apt-get update && \
    apt-get install -y tini cron rdiff-backup && \
    apt-get clean

# Set tini as the entrypoint
ENTRYPOINT ["/usr/bin/tini", "--"]

# Set working directory
WORKDIR /app

# Copy the requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY ./app ./app
COPY ./main.py ./main.py

# Expose the application port
EXPOSE 8686

# Run cron and uvicorn
CMD ["sh", "-c", "cron && uvicorn main:app --host 0.0.0.0 --port 8686"]