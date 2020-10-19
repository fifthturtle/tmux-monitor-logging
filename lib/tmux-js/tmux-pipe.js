// This module is necessary to process the tmux commands whenever a tmux hook is triggered.
// Tmux hooks will run when a window is created or a session is renamed, for example. This module 'pipes' those commands from tmux
//      to the Node server for processing.
// This module is destroyed upon exiting of the program
//
// The pipe is basically an Observable that activates whenever something changes in tmux

"use strict"

const Session = require('./tmux-session');
const tmux = require('./tmux');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { promisify } = require("util");

const pipe = path.join(appRoot, 'hooks-named-pipe');
let stream;
let sessions;

const pipeCommands = {};

pipeCommands['session-created'] = (data) => {
    if (sessions[data.session_id]) return;
    sessions[data.session_id] = new Session(data.session_id, data.session_name);
}

pipeCommands['session-renamed'] = (data) => {
    if (!sessions[data.session_id]) return;
    sessions[data.session_id].update('name', data.session_name);
}

pipeCommands['session-closed'] = data => {
    let s = Object.keys(sessions).find(id => {
        return (data.sessions.indexOf(id) < 0);
    });
    if (!sessions[s]) return;
    sessions[s].destroy().then(res => {
        delete sessions[s];
    });
}

pipeCommands['window-linked'] = data => {
    if (!sessions[data.session_id]) return;
    sessions[data.session_id].addWindow({ id: data.window_id, name: data.window_name, index: data.window_index});
}

pipeCommands['window-renamed'] = data => {
    if (!sessions[data.session_id]) return;
    if (!sessions[data.session_id].windows[data.window_id]) return;
    sessions[data.session_id].windows[data.window_id].update('name', data.window_name)
}

pipeCommands['window-unlinked'] = data => {
    if (!sessions[data.session_id]) return;
    if (!sessions[data.session_id].windows[data.window_id]) return;
    sessions[data.session_id].windows[data.window_id].destroy().then(res => {
        delete sessions[data.session_id].windows[data.window_id];
    });
}

pipeCommands['after-resize-pane'] = data => {
    let s = sessions[data.session_id];
    if (!s) return;
    let w = s.windows[data.window_id];
    if (!w) return;
    w.update('layout', tmux.processLayout(data.layout));
}

pipeCommands['after-select-layout'] = data => {
    let s = sessions[data.session_id];
    if (!s) return;
    let w = s.windows[data.window_id];
    if (!w) return;
    w.update('layout', tmux.processLayout(data.layout));
}

pipeCommands['after-split-window'] = data => {
    let s = sessions[data.session_id];
    if (!s) return;
    let w = s.windows[data.window_id];
    if (!w) return;
    let panes = Object.keys(w.panes);
    let id = data.panes.find(pane => {
        return panes.indexOf(pane) < 0;
    });
    setTimeout(() => {
        w.addPane({id});
        w.update('layout', tmux.processLayout(data.layout));
    }, 500);
}

pipeCommands['pane-exited'] = data => {
    let s = sessions[data.session_id];
    if (!s) return;
    let w = s.windows[data.window_id];
    if (!w) return;
    let panes = Object.keys(w.panes);
    let id = panes.find(pane => {
        return data.panes.indexOf(pane) < 0;
    });
    if (!id) return;
    w.panes[id].destroy().then(res => {
        delete w.panes[id];
        w.update('layout', tmux.processLayout(data.layout));
    });
}

pipeCommands['window-layout-changed'] = data => {
    pipeCommands['pane-exited'](data);
}

pipeCommands['alert-activity'] = data => {
    let s = sessions[data.session_id];
    if (!s) return;
    let w = s.windows[data.window_id];
    if (!w) return;
    data.panes.forEach(pane => {
        let p = w.panes[pane.pane];
        if (!p) return;
        pane.visible++;
        p.lines.total = p.lines.history + p.lines.visible;
        pane.total = pane.history + pane.visible;
        if (p.lines.total !== pane.total || pane.command === 'top')
        {
            p.checkForChanges(pane);
        }
    })
}

let windows = {};

async function processActivity(data)
{
    if (!windows[data.window_id]) windows[data.window_id] = { panes: {}};
    let w = windows[data.window_id];
        data.panes.forEach(pane => {
            pane.total = pane.history + pane.visible;
            if (!w[pane.pane]) w[pane.pane] = { visible: 0, history: 0, total: 0 };
            let p = w[pane.pane];
            if (p.total !== pane.total) {
                p.visible = pane.visible;
                p.history = pane.history;
                p.total = pane.total;
            }
        });
}

async function openPipe(_sessions = false)
{
    if (_sessions) sessions = _sessions;
    let fd = await promisify(fs.open)(pipe, fs.constants.O_RDWR);
    stream = fs.createReadStream(null, {fd})
    stream.on('data', (d) => {
        console.log('data', d.toString());
      let data;
      try {
        data = JSON.parse(d.toString().replace('\n',''));
      } catch(err) {
          return;
      }
      if (pipeCommands[data.hook]) {
          pipeCommands[data.hook](data);
      }
    })
    stream.on('ready', d => {
        console.log('stream open');
    });

    stream.on('close', d => {
        console.log('pipe-closed');
    });
}

module.exports = {
    async connectPipe(sessions) {
        if (!fs.existsSync(pipe)) await tmux.createPipe(pipe);
        openPipe(sessions);
    },
    deletePipe()
    {
        if (fs.existsSync(pipe))
        {
            tmux.removePipe(pipe);
        }
    }
}