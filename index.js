#!/usr/bin/env node

const cluster = require('cluster');
const uuid		= require('uuid');
const axios	  = require('axios');
const express = require('express');
const cors		= require('cors');
const parser  = require('body-parser');
const program = require('commander');
const server  = require('./server.js');

const jobs = {};

function setup () {
	// command line options
	program.option('-w, --workers <number>', 'worker pool size', 10);
	program.parse(process.argv);

	// start the cluster
	cluster.setupMaster({
  	exec: 'worker.js'
  });
}

function batchJob(jobType, jobId, host, nonce, totalSize, batchSize) {
	const TYPE_REQUEST = 'request';
	const TYPE_RESPONSE = 'response';

	let startDate;

	const ids = {
		current: [],
		success: [],
		skipped: [],
		failed: []
	};

	let cancelled = false;
	let erred = false;
	let finished = false;
	let loadingBatch = false;

	let exitedWorkers = 0;
	const poolSize = program.workers;

	const startWorkers = (maxWorkers) => {
		const workerPromises = [];

	  for (let i = 0; i < maxWorkers; i++) {
	  	workerPromises.push(new Promise((resolve, reject) => {
		    worker = cluster.fork();
	    	worker.on('online', function () {
	  	  	console.debug(`Worker ${this.id} online`);
	  	  	this.process.send(['init', [jobType, host, nonce]]);
	  	  	resolve(this)
	    	}.bind(worker));

	    	worker.on('error', function () {
	  	  	console.debug(`Worker ${this.id} failed to start`);
	  	  	reject(this)    		
	    	}.bind(worker));
	  	}));
	  }

	  return Promise.all(workerPromises);
	};

	const loadNextBatch = async function () {
		loadingBatch = true;
		let response;

		console.debug("Loading next batch");

		if (cancelled) {
			console.debug("Job cancelled, not loading batch");
			loadingBatch = false;
			return [];
		}

		let action = jobType === 'process'
			? 'coyote_load_process_batch'
			: 'coyote_load_restore_batch'
		;

		try {
			response = await axios.get(host, {
				params: {
					_ajax_nonce: nonce,
					action: action,
					size: batchSize 
				}
			});

			if (response.data.hasOwnProperty('total')) {
				totalSize = response.data.total;
			}

			response = response.data.ids;
		} catch (error) {
			console.debug(['Unexpected response while loading batch', error]);
			erred = true;
			response = [];
		} finally {
			loadingBatch = false;
		}

		return response;
	};

	const getNextPostId = async function () {
		if (ids.current.length) {
			return ids.current.pop();
		}	else {
			if (loadingBatch) {
				return null;
			}

			const batch = await loadNextBatch();

			if (batch === undefined) {
				console.error('Batch undefined, halting');
				finished = true;
				return;
			}

			if (!batch.length) {
				finished = true;
				return;
			}

			ids.current = batch;
			return await getNextPostId()
		}
	}

	const job = {
		id: jobId,

		progress: function() {
			processed = ids.success.length + ids.skipped.length + ids.failed.length;
			return parseInt((processed / totalSize) * 100);
		},

		start: async function() {
			startDate = new Date();
			workers = await startWorkers(poolSize);

			workers.forEach(async function(worker) {
				worker.on('message', async function (message) {
					console.debug(['Worker message', this.id, message]);

					let [type, payload] = message;

					if (type === TYPE_REQUEST) {
						if (finished || cancelled) {
							this.kill();
							return;
						}

						postId = await getNextPostId();
						if (postId) {
							this.process.send(['id', postId]);
  						return;
 						}
					}

					if (type === TYPE_RESPONSE) {
						let [result, id] = payload;
						ids[result].push(id);

						let processed = ids.success.length + ids.skipped.length + ids.failed.length;
						let percent_done =  parseInt((processed / totalSize) * 100);

						console.debug(`${percent_done}% done`);

						if (finished) {
							this.kill();
							return;
						}

						postId = await getNextPostId()
						if (postId) {
							this.process.send(['id', postId]);
						}
						return;
					}
				}.bind(worker));

				worker.on('exit', function () {
					console.debug(`[Worker ${this.id}] Exiting!`);

					exitedWorkers++;
					if (exitedWorkers === poolSize) {
						console.debug('All workers shut down. Done.')
						const dateDiff = (new Date()).getTime() - startDate.getTime();
						const seconds = dateDiff / 1000;
						console.debug(`Took ${seconds} seconds`);
					}
				}.bind(worker));

				postId = await getNextPostId();

				if (postId) {
					worker.process.send(['id', postId]);
				}
			});
		},
		
		cancel: function() {
			cancelled = true;
		},

		isCancelled: function() {
			return cancelled;
		},

		hasErred: function () {
			return erred;
		}
	};

	return job;
}

function startWebServer() {
	myCluster = {
		pid: process.pid,

		addJob: function(type, host, nonce, totalSize = 0, batchSize = 200) {
			const jobId = uuid.v4();

			console.debug(['Starting job', type, jobId, host, nonce, totalSize, batchSize])

			jobs[jobId] = batchJob(type, jobId, host, nonce, totalSize, batchSize);
			jobs[jobId].start();
			return jobId;
		},

		getJob: function(jobId) {
			return jobs[jobId];
		},

		cancelJob: function(jobId) {
			const job = jobs[jobId];
			if (job !== undefined) {
				job.cancel();
			}
		}
	};

	const app = express();
	app.use(express.json());
	app.use(cors());
	const webserver = server(app, 3000, myCluster);
}

if (cluster.isMaster) {
	setup();
	startWebServer();

  console.log(`Master ${process.pid} ready`);
}