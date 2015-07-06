Collection of test utilities for Magnet.me frontend projects.

# Usage

`npm install magnet-test-utils --save-dev`

In your `karma.conf`:

```javascript
var testUtils = require('magnet-test-utils');

module.exports = function(config) {
	return {
		files : testUtils.files.concat([
			//your files here
		])
	};
};
```
