const ua_parser = require('ua-parser');
const fs = require('fs');
const BASE_VIEW_DIRECTORY = 'app/views'
const INDEX = `${BASE_VIEW_DIRECTORY}/index.html`;
const LOGIN = `${BASE_VIEW_DIRECTORY}/login.html`;
const NOT_FOUND = `${BASE_VIEW_DIRECTORY}/not_found.html`;
const Dispatcher = require('../util/dispatcher');
let dispatcher = new Dispatcher();
const filesRouter = require('./files');


MIMETypes = {
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    xml: 'text/xml',
    mp4: 'video/mp4',
    png: 'image/png',
    ico: 'image/x-icon'
}

dispatcher.use('/', filesRouter);

dispatcher.on('GET', /\//, (request, response) => {
    let browser = ua_parser.parse(request.headers['user-agent']);
    let resource = request.url.slice(1) === '' ? '/' : request.url.slice(1);
    let extension = request.url.split('.')[1];

    /* Log the request to the stdout */
    console.log('[ LOG ]:'.bold, request.headers['host'], '(', browser.toString(), ')', '->', request.url);

    /* Send a MIME type if the resource is well known for us to hear about it, else send nothing */
    let mimetype = MIMETypes[extension === undefined ? 'html' : extension];
    if (mimetype) {
        response.writeHead(200, {
            'Content-Type': mimetype
        });
    }

    if (resource === 'register') {
        resource = LOGIN;
    } else if (resource !== '/' && extension === undefined) {
        resource = `${BASE_VIEW_DIRECTORY}/${resource}.html`
    } else if (resource === '/' || resource === 'index.html') {
        resource = INDEX;
    }

    if (fs.existsSync(resource)) {
        fs.readFile(resource, (err, data) => {
            if (err) {
                console.log('[ ERROR ]:'.error, err.message);
            } else {
                response.end(data);
            }
        });
    } else {
        /* Send 404 page */
        fs.readFile(NOT_FOUND, (err, data) => {
            if (err) {
                console.log('[ ERROR ]:'.error, 'Well, the not found page, is apparently...not found!');
                response.end("NOT FOUND!");
            } else {
                response.end(data);
            }
        });
    }

})

module.exports = dispatcher;