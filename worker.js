const axios	= require('axios');

(function () {
	const self = this;

	let timerId;
	let host;
	let nonce;
	let jobType;

	const startTimer = function () {
		timerId = setTimeout(requestWork, 1000);
	};

	const endTimer = function () {
		clearTimeout(timerId);
	};

	const requestWork = function () {
		self.send(['request', []]);
		startTimer();
	};

	const handleWork = async (postId) => {
		let response;

		let action = jobType === 'process'
			? 'coyote_process_post'
			: 'coyote_restore_post'
		;

		try {
			response = await axios.get(host, { params: {
				action: action,
				_ajax_nonce: nonce,
				post_id: postId
			}});
			self.send(['response', ['success', postId]]);
		} catch (error) {
			console.debug([error, response]);
			self.send(['response', ['failed', postId]]);
		} finally {
			startTimer();
		}
	};

	self.on('message', function (message) {
		const [type, payload] = message;

		if (type === 'init') {
			const [_type, _host, _nonce] = payload;

			jobType = _type;
			host = _host;
			nonce = _nonce;

			return;
		}

		if (type === 'id') {
			endTimer();
			handleWork(payload);
		}
	});

	self.on('exit', () => {
		endTimer();
	});

	startTimer();
}).bind(process)();