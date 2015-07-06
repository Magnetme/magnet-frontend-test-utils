/**
 * This does nothing more than set a flag if errors are triggered.
 * This will be used by loadTest.js to determine if the bundle can be loaded.
 */
window.onerror = function() {
	window.hasErrors = true;
	console.error(arguments);
	return false;
};
