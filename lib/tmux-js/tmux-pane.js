// Pane class. Each instance of the pane class represents one pane in the TMUX server instance
// Pane object reads and stores all lines from TMUX pane and updates the server as new ones are added
// Also detects if pane is in 'top' mode and responds accordingly

const tmux = require('./tmux');
const io = require('./tmux-manager');
const fs = require('fs-extra');

const colors = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

function addLines(obj) {
    return Object.values(obj).reduce((t, n) => {
        return t + n;
    });
}

function getStyle(n) {
    let obj = false;
    switch (Math.floor(n / 10)) {
        case 0:
            if (n % 10 === 1) obj = {
                'font-weight': 900
            };
            if (n % 10 === 7) obj = {
                'color': 'black',
                'background-color': 'white'
            };
            break;
        case 3:
            if (n % 10 < colors.length) obj = {
                color: colors[n % 10]
            };
            break;
        case 4:
            if (n % 10 < colors.length) obj = {
                'background-color': colors[n % 10]
            };
            break;
    }
    return obj;
}

function getStyles(styles) {
    let s = styles.map(getStyle).filter(t => {
        return t;
    });
    if (!s.length) return false;
    let obj = {};
    s.forEach(t => {
        Object.entries(t).forEach(k => {
            obj[k[0]] = k[1];
        });
    })
    return obj;
}

const START_CHAR = "[";
const SEP_CHAR = ";";
const END_CHAR = "m";

function matchCode(chars) {
    if (chars.substr(0, 1) !== START_CHAR) return false;

    let codes = [];
    let isCode = chars.split("").find(l => {
        if (!isNaN(l)) {
            if (!codes.length) codes.push(0);
            codes[codes.length - 1] = (codes[codes.length - 1] * 10) + parseInt(l);
        }
        if (l === SEP_CHAR) codes.push(0);
        return l === END_CHAR;
    });
    if (!isCode) return false;
    return (codes.length) ? codes : false;
}

function fixLine(line) {
    if (!line.trim().length) return " ";
    let s = line.split(`\u001b`).filter(s => {
        return s.length;
    });
    return s.map(chars => {
        let style = matchCode(chars);
        if (!style) return {
            chars
        };
        chars = chars.substr(chars.indexOf(END_CHAR) + 1);
        return {
            style: getStyles(style),
            chars
        };
    })
}

function process(lines, userHost) {
    let output = [];
    lines.forEach(line => {
        let index = line.indexOf(userHost);
        if (index >= 0) {
            let d = line.indexOf('$');
            let p = line.indexOf('#');
            let char;
            if (d * p > 0)
                char = (d < p) ? "$" : "#";
            else
                char = (d > p) ? "$" : "#";
            let cmd = line.split(char).pop();
            let currentDirectory = line.split(char).shift().split(" ").pop().split("").reverse().splice(index).reverse().join("");
            let inputLine = [userHost, currentDirectory].join(" ");
            let wrap = (index) ? { start: line.substr(0, index), end: line.substr((index + inputLine.length), 1) } : false;
            output.push({ userHost, currentDirectory, wrap, char, lines: [cmd]})
        } else {
            output.push(fixLine(line));
        }
    });
    return output;
}

class Pane {
    constructor(id, window, session) {
        this.id = id;
        this.window = window;
        this.session = session;
        this.lines = {
            history: 0,
            visible: 0
        };
        this.process = false;
        io.socket().emit('tmux-init', {
            components: [this.session, this.window, this.id],
            lines: [],
            process: this.process
        });
        this.checkForChanges();
    }

    async checkForChanges(changes = false) {
        let topMode = (changes) ? (changes.command === 'top') : (await tmux.paneStats(this.id)).topMode;
        if (topMode) {
            let top = (await tmux.captureTop(this.id)).map(line => {
                return fixLine(line)
            });
            let obj = {
                components: [this.session, this.window, this.id],
                top
            };
            io.socket().emit('pane-top-data', obj);
            return Promise.resolve(0);
        }
        let history = (changes) ? changes.history : parseInt((await tmux.prop('history_size', this.id)).shift());
        let visible = (changes) ? changes.visible : parseInt((await tmux.prop('cursor_y', this.id)).shift()) + 1;
        let numNewLines = addLines({
            history,
            visible
        }) - addLines({ history: this.lines.history, visible: this.lines.visible });
        if (numNewLines) {
            this.lines = {
                history,
                visible
            };
            let end = visible - numNewLines;
            let start = visible - 1;
            if (changes) end--;
            let pane = this.id;
            let u = await tmux.userHost();
            await tmux.capture({
                    pane,
                    start,
                    end
                })
                .then(res => {
                    let obj = {
                        components: [this.session, this.window, this.id],
                        lines: process(res, u)
                    };
                    io.socket().emit('pane-data', obj);
                });
        }
        return Promise.resolve(0);
    }

    destroy() {
        io.socket().emit('tmux-destroy', {
            components: [this.session, this.window, this.id]
        });
        return Promise.resolve(0);
    }
}

module.exports = Pane;