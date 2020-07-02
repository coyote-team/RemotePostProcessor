function getStatus (req, res) {
  res.send({message: `Online! Cluster running at ${this.pid}`})	;
}

function addJob (req, res) {
	postId = this.addJob(
		req.body.action,
		req.body.host,
		req.body.nonce,
		req.body.batchSize,
	);
	res.send({id: postId});
}

function getJob (req, res) {
	postId = req.params.id;
	const job = this.getJob(postId)

	if (job !== undefined) {
		const progress = job.isCancelled() ? 100 : job.progress();
		res.send({
			id: postId,
			progress: progress
		});
	} else {
		res.status(404).send("Not found");
	}
}

function cancelJob (req, res) {
	postId = req.params.id;
	const job = this.getJob(postId);

	if (job !== undefined) {
		res.send(!job.isCancelled());
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