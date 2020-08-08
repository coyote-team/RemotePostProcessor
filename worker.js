const axios = require('axios');
const uuid  = require('uuid');

(function () {
    const self = this;

    const action = 'coyote_load_process_batch';

    let jobId;
    let host;
    let nonce;
    let size;

    let status = 'null';
    let progress = 0;
    let resources = 0;
    let processed = 0;

    let startDate;

    let cancelled = false;
    let erred = false;
    let finished = false;

    const log = function (payload) {
        console.debug(jobId, self.pid, payload);
    };

    const reply = function (payload) {
        self.send(payload);
    };

    const cancel = function () {
        cancelled = true;
        status = 'cancelled';
    };

    const finish = function () {
        finished = true;
        status = 'finished';
        progress = 100;

        const seconds = Math.abs(((new Date()).getTime() - startDate.getTime()) / 1000);
        log(`Done. Took ${seconds} seconds.`);

        return reply(['update', [status, resources, progress]]);
    };

    const error = function () {
        erred = true;
        status = 'error';
        return reply(['update', [status, resources, progress]]);
    };

    const startExitTimer = () => {
        // worker exits after 5 minutes
        log('Starting killtimer...');
        setTimeout(() => {
            log('Terminating');
            self.exit();
        }, 30000);
    };

    const work = async function () {
        if (cancelled) {
            log("Job cancelled, stopping work");
            startExitTimer();
            return reply(['update', [status, resources, progress]]);
        }

        const [batch, total, _resources] = await loadBatch();

        if (batch === null) {
            startExitTimer();
            return error();
        }

        if (batch === 0) {
            startExitTimer();
            return finish();
        }

        if (total !== null) {
            totalSize = total;
        }

        resources += _resources;
        processed = processed + batch;
        progress = parseInt((processed / totalSize) * 100);

        log(`Loaded batch, ${batch} items. ${progress}% done. ${resources} resources.`);

        reply(['update', [status, resources, progress]]);

        await work();
    };

    const loadBatch = async function () {
        let _response;
        let _size = null;
        let _total = null;
        let _resources = 0;

        log(`Loading batch (${size})`);

        try {
            _response = await axios.get(host, {
                params: {
                    _ajax_nonce: nonce,
                    action: action,
                    size: size
                }
            });

            if (_response.data.hasOwnProperty('total')) {
                _total = _response.data.total;
            }

            _resources = _response.data.resources;
            _size      = _response.data.size;
        } catch (error) {
            log(['Unexpected response while loading batch', error]);
        }

        return [_size, _total, _resources];
    };

    self.on('message', function (message) {
        const [type, payload] = message;

        log(['Message,', message]);

        if (type === 'init') {
            const [_host, _nonce, _size] = payload;

            host    = _host;
            nonce   = _nonce;
            size    = _size;
            status  = 'initialised';
            jobId   = uuid.v4();

            return reply(['ready', jobId]);
        }

        if (type === 'start') {
            startDate = new Date();
            status = 'running';
            reply(['ok']);
            return work();
        }

        if (type === 'cancel') {
            cancel();
            return reply(['update', [status, resources, progress]]);
        }
    });

    self.on('exit', () => {
        log('Exit');
    });

}).bind(process)();