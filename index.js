#!/usr/bin/env node

"use strict"

const readline = require('readline');
const shell = require('child_process');
const tmuxMonitor = require('./lib/tmux-monitor-utilities');
const chalk = require('chalk');
const fs = require('fs-extra');

let path = `${__dirname}/tmux/config.json`;
let config;

const program = require('commander');

// the commander module allows for flags to be added to command line interface. Descriptions of the flags are below, can also be accessed on CL with --help flag
// On initial run, both the ServerName and TMUXName will have to be inputted, either with flags or manually if no flags are detected. They will be saved to config.json file
// On subsequent runs, ServerName and TMUXName will be loaded from config.json unless overriden by flags on CL.
// To save new ServerName or TMUXName use --server-save, --tmux-save  or --save tags

program
    .version('0.0.1')
    .option('-s, --server [Websocket Server URL/IP]', 'URL or IP address of server for websocket connection.')
    .option('--server-save', 'URL or IP address of websocker server + save for future use')
    .option('-t, --tmux [TMUX Server Name]', 'name of this tmux server to be displayed in browser')
    .option('--tmux-save', 'set tmux server name and save for later use')
    .option('--save', 'save TMUX server name and/or URL/IP address of websocket server.')
    .option('-k --kill', 'end the program')
    .option('-c --cycle', 'reset the program')
    .option('-u --update', 'saves the current running processes to a json file')
    .option('-r --reload', 'loads and runs the processes from the json file created by --update')
    .option('--status', 'shows if the tmux-logger is running or not')
    .option('-l, --log', 'run tmux-logger in pane (to see console output.) By default, process runs in background')
    .parse(process.argv)

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// ServerName is the URL/IP address of the machine running the server.
// The program will automatically append the port numbder (default: 8061) so no need to enter it.

function getServerName() {
    return new Promise((resolve, reject) => {
        if (program.server) {
            if ((program.serverSave) || (program.save))
            {
                config.users[config.index].server = program.server;
                console.log(chalk.cyan(program.server) + " is now the default server URL/IP.");
                fs.writeFileSync(path, JSON.stringify(config.users, null, 2));
            }
            resolve(["-s", program.server]);
        }
        else {
            if (config.users[config.index].server) {
                resolve(["-s", config.users[config.index].server]);
                return;
            }
            console.log(chalk.green("No Websocket URL/IP Address Has Been Set."))
            rl.question('Websocket Server URL/IP: ', answer => {
                if (answer.length) {
                    rl.question('Save As Default Websocket URL/IP (Y/N)? ', saveAnswer => {
                        if (saveAnswer.toUpperCase() === 'Y') {
                            config.users[config.index].server = answer;
                            console.log(chalk.cyan(answer) + " is now the default server URL/IP.");
                            fs.writeFileSync(path, JSON.stringify(config.users, null, 2));
                        }
                        resolve(['-s', answer]);
                    });
                }
                else
                    reject('Need to enter valid URL/IP Address!');
            });
        }
    });
}

// TmuxName is simply the string used to describe the TMUX server. It has no programmatic purpose.

function getTmuxName() {
    return new Promise((resolve, reject) => {
        if (program.tmux) {
            if ((program.tmuxSave) || (program.save))
            {
                config.users[config.index].tmuxName = program.tmux;
                console.log(chalk.cyan(program.tmux) + " is now the default TMUX Server Name.");
                fs.writeFileSync(path, JSON.stringify(config.users, null, 2));
            }
            resolve(["-t", program.tmux]);
        }
        else {
            if (config.users[config.index].tmuxName) {
                resolve(["-t", config.users[config.index].tmuxName]);
                return;
            }
            console.log(chalk.green("No TMUX Server Name Has Been Set."))
            rl.question('TMUX Server Name: ', answer => {
                if (answer.length) {
                    rl.question('Save As Default TMUX Server Name (Y/N)? ', saveAnswer => {
                        if (saveAnswer.toUpperCase() === 'Y') {
                            config.users[config.index].tmuxName = answer;
                            console.log(chalk.cyan(answer) + " is now the default TMUX Server Name.");
                            fs.writeFileSync(path, JSON.stringify(config.users, null, 2));
                        }
                        resolve(['-t', answer]);
                    });
                }
                else
                    reject('Need to enter valid TMUX server name!');
            });
        }
    });
}

async function completeTmux(options) {
    await getServerName().then(res => {
        res.forEach(r => { options.push(r); });
        options.unshift(`${__dirname}/tmux/tmux-run`);
        let pcs = shell.spawn('node', options, {
            stdio: (program.log) ? 'inherit' : 'ignore', // piping all stdio to /dev/null
            detached: true
        });
        if (!program.log) pcs.unref();
        console.log('TMUX Logger ' + chalk.cyan(options[2]) + ' Started on Websocket Server ' + chalk.green(options[4]));
        console.log("");
        rl.close();
    }).catch(err => {
        console.log(chalk.red(err));
        completeTmux(options);
    });
}

async function startTmux() {
    let color = (parseInt(config.version.split('.').shift()) >= 2) ? 'green' : 'red';
    console.log(chalk[color](`TMUX Version ${config.version}`));
    if (color === 'red') {
        console.log(chalk.red('TMUX Logger requires TMUX version 2.x or higher.'));
        console.log("");
        rl.close();
        return;
    }
    await getTmuxName().then(res => {
        completeTmux(res);
    }).catch(err => {
        console.log(chalk.red(err));
        startTmux();
    });
}

async function tmuxRunning() {
    if (program.tmux) {
        tmuxMonitor.changeServerName(program.tmux);
        if ((program.saveTmuxName) || (program.save)) {
            config.users[config.index].tmuxName = program.tmux;
            console.log(chalk.cyan(program.tmux) + " is now the default TMUX server name.");
            fs.writeFileSync(path, JSON.stringify(config.users, null, 2));
        }
        rl.close();
        return;
    }

    let msg = (program.server) ? "Server address cannot be changed while TMUX Logger is running!" : "TMUX logger is already running!"
    console.log(chalk.red(msg));
    rl.question('Kill TMUX Logger (Y/N)? ', answer => {
        if (answer.toUpperCase() === 'Y') 
        {
            killTmux();
            console.log(chalk.cyan("TMUX Logging Stopped"));
            console.log("");
        }
        rl.close();
        return;
    });
}

async function getConfig()
{
    let user = await tmuxMonitor.whoami();
    let pid = await tmuxMonitor.tmuxInstancePID();
    let version = await tmuxMonitor.tmuxVersion();
    let users = (fs.existsSync(path)) ? JSON.parse(fs.readFileSync(path)) : [];
    if (!Array.isArray(users)) {
        users.user = user;
        users = [users];
    }
    let index = users.findIndex(u => { return user === u.user; });
    if (index < 0) {
        index = users.length;
        users.push({ user, tmuxName: false, server: false, socketConnected: false });
    }
    fs.writeFileSync(path, JSON.stringify(users, null, 2));
    config = { user, users, index, pid, version };
}

async function init() {
    let running = await tmuxMonitor.tmuxIsRunning();
    await getConfig();
    if (program.status)
    {
        if (running) {
            let _msg = "Web Socket Not Connected";
            let _color = "red";
            if (JSON.parse(fs.readFileSync(path).toString())[config.index].socketConnected)
            {
                _msg = "Web Socket Connected";
                _color = "green";
            }
            console.log(chalk.green(`${config.user} / tmux-logger is running`), ' / ', chalk[_color](_msg));
        }
        else
            console.log(chalk.red(`${config.user} / tmux-logger is not running`));
        console.log('');
        rl.close();
        return;
    }

    if (program.update) {
        rl.close();
        if (!config.pid) {
            console.log(chalk.red('tmux is not running!'));
            return;
        }
        require('./lib/tmux-js/tmux-update').init(config);
        return;
    }

    if (program.reload) {
        rl.close();
        require('./lib/tmux-js/tmux-reload').init(config.user);
        return;
    }

    if (program.kill || program.cycle)
    {
        if (running)
        {
            killTmux();
            running = false;
            if (program.kill)
            {
                rl.close();
                return;
            }
        }
        else
        {
            console.log(chalk.cyan("TMUX Logger is not running"));
            rl.close();
            return;
        }
    }
    
    if (running)
        tmuxRunning();
    else
        startTmux();
}

function killTmux() {
    tmuxMonitor.killTmux();
}

init();