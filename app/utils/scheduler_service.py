from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler()
scheduler.start()

def add_job(job_id, job_func, cron_args, source, destination):
    scheduler.add_job(job_func, 'cron', args=[source, destination], id=f"backup-{job_id}", replace_existing=True, **cron_args)

def remove_job(job_id):
    scheduler.remove_job(f"backup-{job_id}")

def parse_schedule(schedule_str):
    # Convert str like "0 0 * * *" into cron args
    return {"minute": schedule_str.split()[0], "hour": schedule_str.split()[1]}