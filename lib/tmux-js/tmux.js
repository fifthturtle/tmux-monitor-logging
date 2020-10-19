// This is the module that allows for control of tmux from Node. It's basically a TMUX-Node.js module.
// Most of the common tmux functions are present
// The input/output will not be seen in the console and will be procesed behind the scenes.
// Output is formatted in a manner that JS can use

"use strict"

const shell = require('child_process');

// The _exec function takes the command formatted for tmux and returns it as an array
// Formatted as a promise because the stdout of the console sometimes takes a bit to respond.

function _exec(cmd, returnAll = false) { 
    return new Promise((resolve, reject) => {
        shell.exec(cmd, {}, (err, stdout) => {
            if (err) reject(err);
            resolve(stdout.split('\n').filter(s => { return !!s || returnAll; }));
        });
    });
}

module.exports = {
    async _eval(cmd, params = false) {
        let f = (this[cmd]);
        if (!f) return "Invalid Function";

        if (f.toString().split(" ").shift() === 'async')
        {
            return await this[cmd](params);
        } else {
            this[cmd](params);
            return "DONE";
        }
    },

    async _command(cmd) {
        return await _exec(cmd).then(res => {
            return res
        }).catch(err => {
            return err;
        });
    },

    async tmux(cmd) {
        return await this._command(`tmux ${cmd}`);
    },

    /* SESSIONS FUNCTIONS */

    async createSession(name) {
        return await _exec(`tmux new -s ${name} -d`);
    },

    async listSessions(cmd = 'tmux') {
        return (await _exec(`${cmd} ls -F "#{session_id} | #{session_name}"`)).map(s => { let a = s.split("|"); return { id: a[0].trim(), name: a[1].trim() } });
    },

    async currentSession(pane = false)
    {
        return (await this.prop('session_name', pane)).shift();
    },

    /* WINDOW FUNCTIONS */
    
    async getWindows(session = false, cmd = 'tmux') {
        let s = (session) ? `-t '${session}'` : '-a';
        return (await _exec(`${cmd} list-windows ${s} -F "#{window_id} | #{window_name} | #{window_index}"`)).map(s => { let a = s.split("|"); return { id: a[0].trim(), name: a[1].trim(), index: parseInt(a[2].trim()) } });
    },

    async windowProp(window, prop) {
        return await _exec(`tmux list-windows -a -F "#{${prop}}|#{window_id}"`)
            .then(res => {
                return res.find(r => {
                    return (r.split("|").pop() === window)
                }).split("|").shift();
            })
            .catch(err => {
                return [];
            })
    },

    async windowSession(window)
    {
        if (Array.isArray(window)) window = window[0];
        return await this.windowProp(window, 'session_id');
    },

    async windowIndex(window)
    {
        if (Array.isArray(window)) window = window[0];
        return await this.windowProp(window, 'window_index');
    },

    async windowName(window)
    {
        if (Array.isArray(window)) window = window[0];
        return await this.windowProp(window, 'window_name');
    },

    async windowData(window)
    {
        if (Array.isArray(window)) window = window[0];
        let name = await this.windowName(window);
        let index = await this.windowIndex(window);
        return { name, index };
    },

    processLayout(_layout) {
        let elems = ['dimensions', 'left', 'top', 'id'];
        let panes = [];
        let arr = _layout.split(',');
        let dimensions = arr[1].split('x');
        let width = parseInt(dimensions[0]);
        let height = parseInt(dimensions[1]);
        dimensions = { width, height };
        for (let i = 0; i < 3; i++) arr.shift();
        let layout = arr.join(',');
        if (layout.match(/\[|{/g)) {
            layout = layout.substr(2);
            while (layout.indexOf('}') >= 0) layout = layout.replace('}', '');
            while (layout.indexOf(']') >= 0) layout = layout.replace(']', '');
            while (layout.indexOf('{') >= 0) layout = layout.replace('{', ',-1,');
            while (layout.indexOf('[') >= 0) layout = layout.replace('[', ',-1,');
            layout.split(',').forEach((elem, index) => {
                let n = index % 4;
                if (!n) panes.push({ width: parseInt(elem.split('x').shift()), height: parseInt(elem.split('x').pop()) });
                panes[panes.length - 1][elems[n]] = (n) ? parseInt(elem) : elem;
            });
            panes = panes.filter(window => {
                return window.id >= 0;
            }).map(pane => {
                pane.id = `%${pane.id}`;
                return pane;
            });
        } else {
            panes.push({ id: `%${layout.split(",").pop()}`, left:0, top: 0, dimensions, width, height });
        } 
        return { dimensions, panes, layout: _layout };
    },

    async windowLayout(window)
    {
        if (Array.isArray(window)) window = window[0];
        return await _exec(`tmux display -p -t '${window}' '#{window_layout}'`).then(res => {
            return this.processLayout(res[0]);
        });
    },

    /* STYLE FUNCTIONS */

    setOption(option, style, session)
    {
        if (Array.isArray(option)) {
            session = false;
            if (option.length >= 3)
            {
                while (option.length > 3) option.pop();
                session = option.pop();
            }
            style = option.pop();
            option = option.shift();
        }
        let cmd = ["tmux set"];
        if (session) cmd.push(`-t '${session}'`);
        cmd.push(option);
        cmd.push(style);
        shell.exec(cmd.join(" "));
    },

    setStatusColor(color, options = false)
    {
        if (typeof options === 'string' && options.substr(0,1) === '$') options = { session: options }; 
        if (typeof options !== 'object') options = {};
        let side = options.side || "bg";
        this.setOption(`status-${side}`, color, options.session || false)
    },

    /* PANE FUNCTIONS */

    createPane(paneID, dir = 'v')
    {
        let cmd = `tmux splitw -${dir} -t '${paneID}'`;
        shell.exec(cmd);
    },

    killPane(paneID)
    {
        shell.exec(`tmux kill-pane -t '${paneID}'`)
    },

    async paneID() {
        return (await this.prop('pane_id')).shift();
    },

    async getAllPanes() {
        let panes = await _exec(`tmux list-panes -a`);
        let obj = {};
        panes.forEach(pane => {
            let p = pane.split(" ");
            obj[p[6]] = {
                session: p[0].split(":").shift(),
                index: parseInt(p[0].substr(0, p[0].length - 1).split(":").pop().split(".").pop()),
                history: {
                    size: parseInt(p[3].split('/').shift()),
                    max: parseInt(p[3].split('/').pop())
                },
                bytes: parseInt(p[4])
            }
        });
        return obj;
    },
    
    async getPanesByWindow(win, tmux = 'tmux') {
        let cmd = `${tmux} list-panes -a -F "#{pane_pid}|#{window_id}"`;
        return _exec(cmd).then(windows => {
            return windows.filter(w => {
                return w.split("|").pop() == win;
            }).map(w => { return w.split("|")[0]; });
        }).catch(err => {
            return [];
        });
    },  

    async getPanes(window = false)
    {
        if (Array.isArray(window)) window = window[0];
        let cmd = (window) ? `tmux list-panes -t '${window}' -F "#{pane_id} | #{cursor_y} | #{history_size}"` : `tmux list-panes -a -F "#{pane_id} | #{window_id}"`;
        return await _exec(cmd)
                .then(res => {
                    return res.map(r => {
                        let info = r.split("|").map(elem => {
                            elem = elem.trim();
                            return (isNaN(elem)) ? elem : parseInt(elem);
                        });
                        return (window) ? { pane: info[0], visible: info[1] + 1, history: info[2], total: info[1] + 1 + info[2] } : { pane: info[0], window: info[1] };
                    });
                })
                .catch(err => {
                    return [];
                })
    },

    async paneInfo(pane) {
        if (Array.isArray(pane)) pane = pane[0];
        return await _exec(`tmux display-message -p -t '${pane}' -F "#{window_id}|#{session_id}"`)
            .then(res => {
                return { window: res[0].split("|").shift(), session: res[0].split("|").pop() }
            })
            .catch(err => {
                return {};
            })
    },

    pipe(pane, command) {
        _exec(`tmux pipep -I -t '${pane}' "echo ${command}"`);
    },

    selectPane(data) {
        _exec(`tmux switch-client -t '${data.pane}'`);
    },

    async capture(data = {}) {
        let pane = data.pane || await this.paneID();
        let cmd = [`tmux capture-pane -e`];
        cmd.push((data.hasOwnProperty('start')) ? `-pS ${data.start}` : `-pS -2000`);
        cmd.push(`-pE ${data.end}`)
        cmd.push(`-t ${pane}`);
        return _exec(cmd.join(' '), true).then(res => {
            return res;
        });
    },

    async captureTop(pane = false) {
        if (!pane) pane = await this.paneID();
        let start = 0;
        return await this.capture({ pane, start });
    },

    async paneStats(pane = false) {
        if (!pane) pane = await this.paneID();
        let props = ['pane_current_command', 'pane_top', 'pane_left', 'pane_height', 'pane_width', 'pane_mode'].map(p => { return `#{${p}}`});
        let cmd =`tmux display -p -t '${pane}' -F "${props.join('|')}"`;
        return await _exec(cmd).then(async res => {
            let data = {};
            res = res[0].split("|");
            data.topMode = (res.shift() === 'top');
            data.copyMode = (res.pop() === 'copy_mode');
            data.dimensions = res;
            data.process = (await this.paneProcess(pane)) ? true : false;
            return data;
        })
    },

    killPaneProcess(pane, restart = false) {
        this.paneProcess(pane).then(async process => {
            await _exec(`kill -9 ${process.pid}`);
            if (restart) setTimeout(() => { this.pipe(pane,process.command); }, 3000);
        }).catch(err => {
            console.log(err);
        });
    },

    async paneProcess(pane) {
        let pid = (await this.prop('pane_pid', pane)).shift();
        return _exec(`pstree -a -p ${pid} | grep -v {`).then(res => {
            while (res.length && res[0].split(',').shift() === 'bash') res.shift();
            if (!res.length) return false;
            let cmd = res.find(c => {
                return c.split('.').pop() === 'sh';
            });
            if (!cmd) cmd = res.pop();
            let arr = cmd.split(',');
            let command = arr.shift().split('-').pop();
            arr = arr.shift().split(" ");
            let pid = arr.shift();
            if (command.split('.').pop() !== 'sh') arr.unshift(command);
            return { command: arr.join(' '), pid };
        });
    },

    async currentDirectory(pane) {
        let HOME = (await this.variable('HOME')).shift();
        return await this.prop('pane_current_path', pane).then(res => {
            return (res[0] === HOME) ? "~" : res[0].split('/').pop();
        });
    },

    /* HOOKS & PIPE */

    setMonitorHook(name, pathToScript, params = []) {
        let cmd = [`tmux set-hook -g ${name} 'run-shell "bash ${pathToScript} HOOK=\\"#{hook}\\"`];
        params.forEach(param => {
            let str = (isNaN(param.value)) ? `#{${param.value}}` : param.value;
            cmd.push(`${param.key}=\\"${str}\\"`);
        });
        _exec(cmd.join(" ") + `"'`);
    },

    clearHook(name) {
        _exec(`tmux set-hook -gu ${name}`)
    },

    async getHooks() {
        return _exec('tmux show-hooks -g').then(hooks => {
            return hooks.map(hook => {
                return hook.split(" ").shift();
            });
        });
    },

    async createPipe(pipe) {
        return _exec(`mkfifo ${pipe}`).then(res => {
            return true;
        }).catch(err => {
            return false;
        })
    },

    removePipe(pipe) {
        _exec(`unlink ${pipe}`);
    },

    monitorActivity(value = "on") {
        return _exec(`tmux set -g monitor-activity ${value}`).then(res => {
            return _exec(`tmux set -g activity-action any`).then(res => {
                return true;
            });
        });
    },



    /* PROP AND VARIABLE FUNCTIONS */

    async prop(name, pane = false) {
        if (Array.isArray(name)) {
            pane = (name.length > 1) ? name.pop() : false;
            name = name.shift();
        }
        let cmd = `tmux display-message -p`;
        if (pane) cmd = `${cmd} -t '${pane}'`;
        return await _exec(`${cmd} "#{${name}}"`);
    },

    async userHost(pane) {
        return await _exec('tmux display -p -F "${USER}|#{host}"').then(res => {
            let s = res[0].split('|');
            return s[0] + "@" + s[1].split('.').shift();
        })
    },

    async variable(name) {
        return await _exec(`tmux display-message -p "$${name}"`);
    },

    async user() {
        return (await this.variable("USER")).shift();
    },

    async version() {
        return (await _exec('tmux -V'))[0].split(" ").pop();
    }
}