import subprocess
import logging

def execute_backup(source, destination):
    """
    Perform a backup from source to destination using rdiff-backup.
    """
    try:
        # Command to execute rdiff-backup
        command = ["rdiff-backup", source, destination]
        
        # Execute the rdiff-backup command
        result = subprocess.run(command, check=True, capture_output=True, text=True)

        # Log the output results
        logging.info(f"Backup successful: {result.stdout}")

    except subprocess.CalledProcessError as e:
        # Handle exceptions and log errors
        logging.error(f"Backup failed: {e.stderr}")