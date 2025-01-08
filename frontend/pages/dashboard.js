import React from 'react';
import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography } from '@mui/material';

export default function Dashboard({ jobs }) {
  const handleStartJob = async (jobId) => {
    try {
      const response = await fetch(`http://localhost:8686/jobs/${jobId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Adjust headers based on your API requirements
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to start job ${jobId}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Job started successfully:', data);
    } catch (error) {
      console.error('Error starting job:', error);
    }
  };

  const handleStopJob = async (jobId) => {
    try {
      const response = await fetch(`http://localhost:8686/api/jobs/${jobId}/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Adjust headers based on your API requirements
        },
      });
  
      if (!response.ok) {
        throw new Error(`Failed to stop job ${jobId}: ${response.statusText}`);
      }
  
      const data = await response.json();
      console.log('Job stopped successfully:', data);
    } catch (error) {
      console.error('Error stopping job:', error);
    }
  };
  

  return (
    <div>
      <Typography variant="h3" component="h1" gutterBottom>
        Backup Jobs Dashboard
      </Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Job Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last Run</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs && jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell>{job.name}</TableCell>
                <TableCell>{job.status}</TableCell>
                <TableCell>{job.lastRun}</TableCell> 
                <TableCell>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => handleStartJob(job.id)}
                  >
                    Start
                  </Button>
                  <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => handleStopJob(job.id)}
                    style={{ marginLeft: '10px' }}
                  >
                    Stop
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}

export async function getServerSideProps() {
  const res = await fetch('http://localhost:8686/jobs');
  
  if (!res.ok) {
    console.error("Failed to fetch job data from the API");
    return { props: { jobs: [] } };
  }

  const jobs = await res.json();

  const jobsWithResults = await Promise.all(jobs.map(async (job) => {
    const res = await fetch(`http://localhost:8686/jobs/${job.id}/results`);
    if (!res.ok) {
      console.error(`Failed to fetch results for job: ${job.id}`);
      return { ...job, lastRun: "N/A" };
    }
    
    const results = await res.json();
    let lastRun = "N/A";

    if (results.length > 0) {
      const latestResult = results.reduce((prev, current) => {
        return (new Date(prev.timestamp) > new Date(current.timestamp)) ? prev : current;
      });
      lastRun = `${latestResult.timestamp} - ${latestResult.status}`;
    }

    return { ...job, lastRun };
  }));

  return { props: { jobs: jobsWithResults } };
}