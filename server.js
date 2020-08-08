function getStatus (req, res) {
    res.send({message: `Online! Cluster running at pid ${this.pid}`}) ;
}

async function addJob (req, res) {
    const jobId = await this.addJob(
        req.body.host,
        req.body.nonce,
        req.body.batchSize,
       );
    res.send({id: jobId});
}

function getJob (req, res) {
    const jobId = req.params.id;
    const job = this.getJob(jobId)

    if (job !== undefined) {
        res.send({
            id: jobId,
            progress: job.progress,
            status: job.status
        });
    } else {
        res.status(404).send("Not found");
    }
}

function cancelJob (req, res) {
    const jobId = req.params.id;
    const job = this.getJob(jobId);

    if (job !== undefined) {
        this.cancelJob(jobId);
        res.send(job.status);
    } else {
        res.status(404).send("Not found");
    }
}

module.exports = function(app, port, cluster) {
    app.get('/status', getStatus.bind(cluster));
    app.post('/jobs', addJob.bind(cluster));
    app.get('/jobs/:id', getJob.bind(cluster))
    app.delete('/jobs/:id', cancelJob.bind(cluster))

    app.listen(port, () => console.log(`Cluster webserver listening at http://localhost:${port}`));

    return app;
};