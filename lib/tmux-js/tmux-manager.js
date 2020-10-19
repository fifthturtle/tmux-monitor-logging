// this module allows limited tmux commands to be sent from the web app to make modifications in tmux

const io = require('socket.io-client');
const tmux = require('./tmux');
const fs = require('fs-extra');
const path = require('path');
const tmuxUtil = require('./../tmux-monitor-utilities');
let socket;

function saveConfigData(configData)
{
    fs.writeFileSync(path.join(appRoot, 'config.json'), JSON.stringify(configData, null, 2));
}

async function disconnectSocket()
{
    let user = await tmuxUtil.whoami();
    let configData = JSON.parse(fs.readFileSync(path.join(global.appRoot, 'config.json').toString()));
    let index = configData.find(cd => { return cd.user === user });
    if (index >= 0)
    {   
        configData[index].socketConnected = false;
        saveConfigData(configData);
    }
}

function connect(address) {
    disconnectSocket();
    socket = io.connect(`${address}:8061/tmux-logging`, {
        path: "/myapp/socket.io",
        reconnection: true
    });

    socket.on('disconnect', () => {
        disconnectSocket();
    })

    socket.on('connect', async () => {
        // the user data is used to make sure only qualified users can send commands
        let user = await tmuxUtil.whoami();
        let configData = JSON.parse(fs.readFileSync(path.join(appRoot, 'config.json').toString()));
        let index = configData.find(cd => { return cd.user === user; });
        if (index >= 0)
        {
            configData[index].socketConnected = true;
            saveConfigData(configData);
        }
        socket.on('split-pane', data => {
            tmux.createPane(data.id, data.direction);
        });
        socket.on('kill-pane', data => {
            tmux.pipe(data.id, "exit");
        });
        socket.on('restart-pane', data => {
            tmux.killPaneProcess(data.id, true);
        });
        socket.on('kill-pane-process', data => {
            tmux.killPaneProcess(data.id);
        });
        socket.on('select-pane', data => {
            tmux.selectPane(data);
        });
        socket.on('pipe-pane', data => {
            tmux.pipe(data.id, data.textCommand);
        });
    });

    return Promise.resolve(true);
}

module.exports = {
    connect,
    socket() {
        return socket;
    }
}