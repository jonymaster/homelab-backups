# Use the official Python base image with Python 3.10
FROM python:3.10-slim

# Install tini, tzdata, and other required packages
RUN apt-get update && \
    apt-get install -y tini cron rdiff-backup procps tzdata && \
    apt-get clean

# Set the timezone (example for Europe/Madrid)
ENV TZ=Europe/Madrid
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Set tini as the entrypoint
ENTRYPOINT ["/usr/bin/tini", "--"]

# Set working directory inside the container
WORKDIR /app

# Copy files from the build context (project root)
COPY ../app/requirements.txt .
COPY ../app ./
COPY ../app/main.py ./

RUN pip install --no-cache-dir -r requirements.txt

# Expose the application port
EXPOSE 8686

# Run cron and the uvicorn server
CMD ["sh", "-c", "cron && uvicorn main:app --host 0.0.0.0 --port 8686"]