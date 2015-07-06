module.exports = {
	files : [
		__dirname + '/bindPolyfill.js',
		require.resolve('angular-mocks'),
		require.resolve('es6-promise'),
		__dirname + '/util.js',
		__dirname + '/errorCollector.js',
		__dirname + '/test.css'
	]
};
