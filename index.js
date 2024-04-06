const http = require('http');
const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const LOG_FILE = path.join(__dirname, 'access.log');
const CREDENTIALS_FILE = path.join(__dirname, 'credentials.json');

// Ensure the uploads directory exists
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Read credentials from JSON file
let credentials = {};
try {
    credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE));
} catch (err) {
    console.error("Error reading credentials file:", err);
    // Initialize with an empty object if the file is not found or an error occurs
    credentials.files = {}; 
}

const server = http.createServer((req, res) => {
    // Log request info
    logRequest(req);

    // Parse request URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const query = url.searchParams;

    // Route requests based on pathname
    switch (pathname) {
        case '/createFile':
            handleCreateOrModifyFile(req, res, query, false);
            break;
        case '/getFiles':
            handleGetFiles(req, res);
            break;
        case '/getFile':
            handleGetFile(req, res, query);
            break;
        case '/modifyFile':
            handleCreateOrModifyFile(req, res, query, true);
            break;
        case '/deleteFile':
            handleDeleteFile(req, res, query);
            break;
        default:
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
    }
});

const PORT = 5000;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

function logRequest(req) {
    const clientIP = req.connection.remoteAddress;
    const logEntry = ` [${new Date().toISOString()}]  ${req.method}  ${req.url}  Client IP: ${clientIP}\n`;
    fs.appendFile(LOG_FILE, logEntry, err => {
        if (err) console.error(' Oops! Something went wrong while writing to the log file:', err);
    });
}



// Unified function for creating or modifying a file
function handleCreateOrModifyFile(req, res, query, isModify) {
    const filename = query.get('filename');
    const content = query.get('content');
    const password = query.get('password');

    console.log('Filename:', filename);
    console.log('Content:', content);
    console.log('Password:', password);

    if (!filename || !content) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(isModify ? 'Filename and new content are required for modification' : 'Filename and content are required for creation');
        return;
    }

    // Determine if we are setting or updating a password
    let settingPassword = false;
    if (password !== null) {
        // Check if the file already exists in the credentials
        if (!credentials.files[filename]) {
            // Initialize credentials entry if it doesn't exist
            credentials.files[filename] = {};
        }
        // Update the password only if it's different or if the file is new
        if (credentials.files[filename].password !== password) {
            credentials.files[filename].password = password;
            settingPassword = true;
        }
    }

    // Check if authorization is required and validate it
    if (credentials.files[filename] && credentials.files[filename].password) {
        if (!password) {
            console.log('Unauthorized - Password required');
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized - Password required');
            return;
        } else if (password !== credentials.files[filename].password) {
            console.log('Unauthorized - Incorrect password');
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized - Incorrect password');
            return;
        }
    }

    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFile(filePath, content, err => {
        if (err) {
            console.error('Error writing file:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
            return;
        }

        // Update the credentials.json file if a new password was set or updated
        if (settingPassword) {
            fs.writeFile(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), err => {
                if (err) {
                    console.error('Error updating credentials file:', err);
                    // Proceed to send the response even if there's an error updating the credentials file
                }
            });
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(isModify ? 'File modified successfully' : 'File created successfully');
    });
}


function handleGetFiles(req, res) {
    fs.readdir(UPLOADS_DIR, (err, files) => {
        if (err) {
            console.error('Error reading directory:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(files));
    });
}

function handleGetFile(req, res, query) {
    const filename = query.get('filename');
    const password = query.get('password');

    if (!filename) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Filename is required');
        return;
    }

    // Check if authorization is required and validate it
    if (credentials.files[filename]) {
        if (password === null && credentials.files[filename].password) {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized - Password required');
            return;
        } else if (password !== credentials.files[filename].password) {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized - Incorrect password');
            return;
        }
    }

    const filePath = path.join(UPLOADS_DIR, filename);
    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('File not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(data);
    });
}

function handleDeleteFile(req, res, query) {
    const filename = query.get('filename');
    const password = query.get('password');

    if (!filename) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Filename is required');
        return;
    }

    // Check if authorization is required and validate it
    if (credentials.files[filename]) {
        if (password === null && credentials.files[filename].password) {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized - Password required');
            return;
        } else if (password !== credentials.files[filename].password) {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized - Incorrect password');
            return;
        }
    }

    const filePath = path.join(UPLOADS_DIR, filename);
    fs.unlink(filePath, err => {
        if (err) {
            console.error('Error deleting file:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('File deleted successfully');
    });
}
