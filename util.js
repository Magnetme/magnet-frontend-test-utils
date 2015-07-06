/**
 * this file does not contain any tests. Instead it contains some utilities to make testing easier.
 */
(function() {
	/**
	 * Get the url of the current script (the caller of this function)
	 *
	 * Limitations:
	 * - It only works with scripts served over http/https
	 * - Scripts must have a .js extension
	 * - It doesn't include query string parameters (it stops at .js)
	 *
	 * Tested with the Chrome, Firefox and PhantomJS runners
	 */
	function getScriptUrl() {
		//The way we're going to get the script directory is not straightforward:
		//The browser does not have a way to directly request the script file, but we do have a way
		//to generate a stacktrace. So that's what we're going to do: we generate a stacktrace,
		//and parse that to figure out what script we are.
		//On extra note:
		//In most browsers we should be able to generate a stacktrace with `new Error().stack`, but
		//some browsers (e.g. PhantomJS) only generate a stacktrace when the error is actually thrown.
		//So, unfortunatally we'll have to use try-catch here
		try {
			throw new Error();
		} catch (e) {
			var stack = e.stack;
			var scripts = stack
				.split('\n')
				.filter(function filterStack(line) {
					//Filter out lines that are not part of the stacktrace by checking if a line contains https?
					return line.match(/https?:\/\//);
				})
				.map(function getScript(line) {
					//get the script from a line in the stack trace
					var fullPath = line.match(/https?:\/\/.*?\.js/);
					if (fullPath && fullPath.length) {
						return fullPath[0];
					} else {
						//not much we can do when we don't have a script found. For now we just return the line
						//Can probably be improved still, but it's sufficient for now
						return line;
					}
				});

			//Let's filter the util script out of the scripts array
			var utilPath = scripts[0];
			scripts = scripts.filter(function filterUtilPath(scriptPath) {
				return scriptPath !== utilPath;
			});

			//Now the first item left is the caller of the util function
			return scripts[0];
		}
		//If we get here we couldn't determine the script path
		throw new Error("Could not find script path");
	}
	 /**
	 * Gets the directory where the script is in, relative to the root of the project
	 */
	function getScriptDir() {
		var pathParts = getScriptPath().split('/');
		return pathParts.slice(0, pathParts.length - 1).join('/');
	}

	/**
	 * Get the path of the script on the file system, relative to the root of the project.
	 */
	function getScriptPath() {
		return getScriptUrl().replace(/^https?:\/\/[^\/]*\/base\//, '');
	}

	/**
	 * Load and compile a template
	 *
	 * The template will be compiled with Angular.
	 *
	 * @param {String} path - The path to the template on the file system.
	 * @param {Object} [opts] - An optional object containing additional options
	 * @param {Object} [opts.scope] - The angular scope that should be used for the template.
	 * @param {Object} [opts.isolateScope] - If the new scope should be isolated (defaults to false)
	 */
	function loadTemplate(path, opts) {
		opts = opts || {};

		//First load the module that will load the template (with the karma ng html preprocessor)
		//This will not actually give us the template, but it will put it into the $templateCache
		module(path);
		var el;
		//Then we need to inject some services with the help of angular-mocks
		inject(function prepareTemplateTest($templateCache, $compile, $rootScope) {
			var tpl = $templateCache.get(path);
			el = angular.element(tpl);
			var scope = opts.scope;
			//If scope is not actually a scope, or not set at all, we first need to create a real scope.
			//We can then used the passed in scope to assign properties to the newly created scope
			if (!scope || !scope.$watch) {
				scope = $rootScope.$new(!!opts.isolateScope);
				if (opts.scope) {
					angular.extend(scope, opts.scope);
				}
			}
			//Now that we have the scope and the template we can compile the template and trigger the initial
			//$digest cycle, to trigger all initial watches
			$compile(el)(scope);
			scope.$digest();
		});
		return el;
	}

	beforeEach(function() {
		//Setup te waitFor matchers
		jasmine.addMatchers({
			//This is a very ugly hack: jasmine doesn't allow to manually trigger a failure, it always
			//needs to be done in a matcher.
			//That doesn't work though for timeouts, because there isn't anything to match on.
			//Due to lack of a lower-level api to trigger test failure we just have an fail matcher
			//that uses it's argument as message
			fail : function() {
				return {
					compare : function(actual, msg) {
						//For some reason jasmine doesn't want to print the message of a custom matcher when
						//used async. Therefore we just error ourself
						return {
							pass: false,
							message : msg.toString()
						};
					}
				};
			}

		});
	});

	/**
	 * Utility function that allows to wait until a certain condition passes.
	 *
	 * @param {Function | String } check The function that checks the condition. When this is true the promise will be resolved.
	 *                                   Alternatively a query selector may be passed. In that case the promise will resolve
	 *                                   when the element specified by the query selector is present.
	 * @param {Number} [timeout] Timeout (ms) after which the waitFor function will fail. Default is 1000ms.
	 * @param {Number} [interval] The interval (ms) at which the check will be performed. Default is 50ms.
	 * @return {Promise} A promise that will be resolved when the check returns true.
	 *                   On timeout the promise will be rejected as well as a matcher will fail.
	 */
	function waitFor(check, timeout, interval) {
		//If check is string, we use it as a query selector to wait for
		if (check instanceof String || typeof check === 'string') {
			var queryString = check;
			//Note: DONT replace this with document.querySelector.bind: phantomJS doesn't understand bind
			//and the polyfill doesn't work properly with the dom.
			check = function() {
				return document.querySelector(queryString);
			};
		}
		return new Promise(function(resolve, reject) {
			interval = interval || 50;
			timeout = timeout || 1000;
			var intervalHandle, timeoutHandle;
			intervalHandle = setInterval(function() {
				try {
					if (check()) {
						clearInterval(intervalHandle);
						clearTimeout(timeoutHandle);
						resolve();
					}
				} catch(e) {
					clearInterval(intervalHandle);
					clearTimeout(timeoutHandle);
					reject(e);
				}
			}, interval);

			function timeoutError() {
				clearInterval(intervalHandle);
				expect().fail("waitFor timed out after " + timeout + "ms");
				//This is not an error: for some reason the message isn't displayed when we just fail once in async tests.
				//Therefore we fail twice!
				expect().fail("waitFor timed out after " + timeout + "ms");
				reject();
			}
			timeoutHandle = setTimeout(timeoutError, timeout);
		});
	}

	/**
	 * Waits until a function has reached a stable state.
	 *
	 * A function has reached a stable state when it returns exactly the same value twice in a row.
	 *
	 * @param {Function} checker The function that should become stable
	 * @param {Number} [timeout] Time in ms after which a timeout is triggerd (default: 1000ms)
	 * @param {Number} [interval] The time between checks. Default: 50ms
	 *
	 * @return {Promise} A promise that will be resolved when the function has become stable
	 */
	function waitUntilStable(checker, timeout, interval) {
		var previousVal;
		return waitFor(function() {
			var currentVal = checker();
			var isStable = currentVal === previousVal;
			previousVal = currentVal;
			return isStable;
		}, timeout, interval);
	}

	/**
	 * Value that can be used to indicate unstableness in a check function.
	 *
	 * Sometimes you want to manually indicate that a function is unstable (e.g. when still waiting
	 * for something to load). To do so we have our unstable magic variable here. It's set to NaN
	 * because NaN !== NaN, so it will never become stable.
	 */
	waitUntilStable.unstable = NaN;

	/**
	 * Async fail method. It will create a callback that will trigger a test failure when it gets passed
	 * an error argument. Both on fail and on success it will then call the done function passed in.
	 *
	 * This method is suitable to be used to create a catch callback for promises.
	 *
	 * Example:
	 * it('should not fail', function(done) {
	 *     testUtil.waitFor(something)
	 *       .then(doSomething)
	 *       .catch(testUtil.asyncFail(done));
	 * });
	 */
	function asyncFail(done) {
		return function(error) {
			if (error) {
				expect().fail(error);
			}
			done();
		};
	}

	/**
	 * Pauses execution by showing a confirmation box before triggering a debugger statement.
	 * This allows the user to open the debugger tools to catch the breakpoint.
	 *
	 * Usage for Chrome is a bit different from other browsers: You cannot open the devtools during a
	 * confirm dialog in Chrome. To use this method with Chrome you should wrap all code that should
	 * be executed *after* the pause in a callback and pass it to the pause method.
	 * If a callback is given the confirm dialog will give you 5 seconds to open the devtools after
	 * clicking OK before it triggers the breakpoint and continues execution.
	 */
	function pause(cb) {
		var message = cb ?
			"Execution paused.\nIf you click 'OK' a breakpoint will be triggered in 5 seconds before the callback will be called. Open your debugger tools to stop on the breakpoint. Clicking 'cancel' will close the dialog and continue execution" :
			"Execution paused.\nIf you click 'OK' a breakpoint will be triggered before execution will continue. If you have your debugger tools open execution will stop on the breakpoint. Clicking 'cancel' will close the dialog and continue execution";
		if(confirm(message)) {
			if (cb) {
				setTimeout(function() {
					debugger;
					cb();
				}, 5000);
			} else {
				debugger;
			}
		} else if (cb) {
			cb();
		}
	}


	window.testUtil = {
		getScriptPath : getScriptPath,
		getScriptDir : getScriptDir,
		loadTemplate : loadTemplate,
		waitFor : waitFor,
		waitUntilStable : waitUntilStable,
		asyncFail : asyncFail,
		pause : pause
	};

}());
