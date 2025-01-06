import os

def create_backup_script(job):
    script_content = f"""#!/bin/bash
    rdiff-backup {job.source} {job.destination}
    """
    script_filename = f'backup_{job.id}.sh'
    script_path = f'/path/to/scripts/{script_filename}'

    with open(script_path, 'w') as script_file:
        script_file.write(script_content)
    
    os.chmod(script_path, 0o755)
    return script_path