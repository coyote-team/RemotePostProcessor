#!/usr/bin/env node

const cluster = require('cluster');
const express = require('express');
const cors    = require('cors');
const parser  = require('body-parser');
const server  = require('./server.js');

const jobs = {};
const workers = {};

function setup () {
    // start the cluster
    cluster.setupMaster({
        exec: 'worker.js'
    });
}

function batchJob(host, nonce, batchSize) {
    const createJob = (resolve, worker) => {
        const job = {
            processId: worker.id,
            status: 'ready',
            progress: 0,
            resources: 0,

            start: () => {
                worker.send(['start']);
            },

            cancel: () => {
                worker.send(['cancel']);
            }
        };

        worker.on('message', async function (message) {
            console.dir(['WorkerMessage', this.id, message]);
            const [type, payload] = message;

            if (type === 'ready') {
                job.id = payload;
                jobs[job.id] = job;
                workers[this.id] = job.id;
                resolve(job);
            }

            else if (type === 'update') {
                const [status, resources, progress] = payload;

                job.status    = status;
                job.resources = resources;
                job.progress  = progress;
            }

            else if (type === 'ok') {
                job.status = 'started';
            }

            else {
                console.warn(['Unknown message', this.id, message]);
            }
        }.bind(worker));
    };

    return new Promise((resolve, reject) => {
        const worker = cluster.fork();

        worker.on('online', function () {
            console.debug(`Worker ${this.id} online`);
            createJob(resolve, worker);
            workers[this.id] = {};
            this.process.send(['init', [host, nonce, batchSize]]);
        }.bind(worker));

        worker.on('error', function () {
            console.debug(`Worker ${this.id} failed to start`);
            reject(this);
        }.bind(worker));

        worker.on('exit', function () {
            console.debug(`Worker ${this.id} exiting`);
            const jobId = workers[this.id];
            delete jobs[jobId];
            delete workers[this.id];
        }.bind(worker));
    });
}

function startWebServer() {
    myCluster = {
        pid: process.pid,

        addJob: async function(host, nonce, batchSize = 200) {
            console.dir(['Starting job', host, nonce, batchSize])
            const job = await batchJob(host, nonce, batchSize);
            job.start();
            console.dir(['Job started', job]);
            return job.id;
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