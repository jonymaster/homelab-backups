export interface BackupJob {
    id: number;
    name: string;
    source: string;
    destination: string;
    schedule: string;
    status: string;
    results?: BackupResult[];
}

export interface BackupResult {
    id: number;
    job_id: number;
    timestamp: string;
    status: string;
    result: string;
    details: string;
    backup_job?: BackupJob;
}