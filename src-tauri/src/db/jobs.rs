use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, serde::Serialize)]
pub struct JobStatus {
    pub status: String, // "running" | "done" | "error"
    pub output: String,
}

pub struct Job {
    pub status: Arc<Mutex<JobStatus>>,
}

pub struct JobManager {
    jobs: Mutex<HashMap<String, Job>>,
}

impl JobManager {
    pub fn new() -> Self {
        Self { jobs: Mutex::new(HashMap::new()) }
    }

    pub fn create_job(&self, id: &str) -> Arc<Mutex<JobStatus>> {
        let status = Arc::new(Mutex::new(JobStatus {
            status: "running".to_string(),
            output: String::new(),
        }));
        self.jobs.lock().unwrap().insert(id.to_string(), Job { status: status.clone() });
        status
    }

    pub fn get_status(&self, id: &str) -> Option<JobStatus> {
        self.jobs.lock().unwrap().get(id).map(|j| j.status.lock().unwrap().clone())
    }

    pub fn remove(&self, id: &str) {
        self.jobs.lock().unwrap().remove(id);
    }
}
