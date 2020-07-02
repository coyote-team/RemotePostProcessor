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
	job = this.getJob(postId);
	res.send({
		id: postId,
		progress: job.progress()
	});
}

module.exports = function(app, port, cluster) {
	app.get('/status', getStatus.bind(cluster));
	app.post('/jobs', addJob.bind(cluster));
	app.get('/jobs/:id', getJob.bind(cluster))

	app.listen(port, () => console.log(`Cluster webserver listening at http://localhost:${port}`));

	return app;
};