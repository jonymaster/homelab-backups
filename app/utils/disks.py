import os
import shutil


def disk_usage():
    disks = []
    for path in os.getenv("DISK_PATHS", "/app/destination").split(","):
        path = path.strip()
        try:
            usage = shutil.disk_usage(path)
        except OSError:
            continue
        disks.append({"path": path, "total_bytes": usage.total, "used_bytes": usage.used, "free_bytes": usage.free})
    return disks
