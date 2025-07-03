/**
 * FRC 2024 Protocol Implementation
 * https://frcture.readthedocs.io/en/latest/driverstation/index.html
 */

const dgram = require('dgram');
const EventEmitter = require('events');

class FRCProtocol extends EventEmitter {
    constructor() {
        super();
        
        // constants
        this.ROBOT_PORT = 1110;
        this.DS_PORT = 1150;
        this.TCP_PORT = 1740;
        this.PACKET_SIZE = 1024;
        this.SEQUENCE_NUM_SIZE = 2;
        this.COMM_VERSION = 0x01;
        
        // current state save
        this.robotState = {
            enabled: false,
            mode: 'teleop',
            emergencyStop: false,
            brownedOut: false,
            systemWatchdog: false,
            batteryVoltage: 0.0,
            canUtilization: 0.0,
            wifiDB: 0,
            wifiMB: 0.0,
            dsVersion: '24.0.1',
            pcmVersion: '',
            pdpVersion: '',
            radioVersion: ''
        };
        
        // control state
        this.controlState = {
            sequenceNumber: 0,
            joysticks: [],
            alliance: 'red',
            position: 1,
            matchTime: 0,
            gameData: ''
        };
        
        // connection state
        this.DS_PORT = 1150; // Driver Station port
        this.ROBOT_PORT = 1110; // Robot port
        this.PACKET_SIZE = 1024; // Max packet size
        this.COMM_VERSION = 0x01; // Communication version
        this.socket = null;
        this.robotIP = '10.TE.AM.2';
        this.connected = false;
        this.sendInterval = null;
        this.heartbeatInterval = null;
        this.SEND_RATE = 20;
        this.HEARTBEAT_RATE = 1000;
        
        this.initializeJoysticks();
    }
    
    initializeJoysticks() {
        // init - ty google
        for (let i = 0; i < 6; i++) {
            this.controlState.joysticks[i] = {
                axes: new Array(12).fill(0),
                buttons: 0, 
                pov: -1
            };
        }
    }
    
    connect(robotIP = null) {
        if (robotIP) {
            this.robotIP = robotIP;
        }
        
        try {
            this.socket = dgram.createSocket('udp4');
            
            this.socket.on('message', (msg, rinfo) => {
                this.handleRobotMessage(msg, rinfo);
            });
            
            this.socket.on('error', (err) => {
                console.error('UDP Socket error:', err);
                this.emit('error', err);
                this.disconnect();
            });
            
            this.socket.bind(this.DS_PORT, () => {
                console.log(`DS bound to port ${this.DS_PORT}`);
                this.startSendLoop();
                this.startHeartbeat();
                this.connected = true;
                this.emit('connected');
            });
            
        } catch (error) {
            console.error('Error connecting to robot:', error);
            this.emit('error', error);
        }
    }
    
    disconnect() {
        this.connected = false;
        
        if (this.sendInterval) {
            clearInterval(this.sendInterval);
            this.sendInterval = null;
        }
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        
        this.emit('disconnected');
    }
    
    startSendLoop() {
        this.sendInterval = setInterval(() => {
            if (this.connected) {
                this.sendControlPacket();
            }
        }, this.SEND_RATE);
    }
    
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.connected) {
                this.emit('heartbeat', this.robotState);
            }
        }, this.HEARTBEAT_RATE);
    }
    
    sendControlPacket() {
        const packet = this.buildControlPacket();
        
        this.socket.send(packet, this.ROBOT_PORT, this.robotIP, (err) => {
            if (err) {
                console.error('Error sending packet:', err);
                this.emit('error', err);
            }
        });
        
        this.controlState.sequenceNumber++;
        if (this.controlState.sequenceNumber > 65535) {
            this.controlState.sequenceNumber = 0;
        }
    }
    
    buildControlPacket() {
        const buffer = Buffer.alloc(this.PACKET_SIZE);
        let offset = 0;
        
        buffer.writeUInt16BE(this.controlState.sequenceNumber, offset); offset += 2;
        buffer.writeUInt8(this.COMM_VERSION, offset); offset += 1;
        
        let controlByte = 0;
        if (this.robotState.enabled) controlByte |= 0x04;
        if (this.robotState.mode === 'auto') controlByte |= 0x02;
        if (this.robotState.mode === 'test') controlByte |= 0x01;
        if (this.robotState.emergencyStop) controlByte |= 0x80;
        buffer.writeUInt8(controlByte, offset); offset += 1;
        
        buffer.writeUInt8(0x01, offset); offset += 1;
        
        // Alliance and position
        buffer.writeUInt8(this.controlState.alliance === 'red' ? 0 : 1, offset); offset += 1;
        buffer.writeUInt8(this.controlState.position, offset); offset += 1;
        
        // Match time
        buffer.writeUInt16BE(this.controlState.matchTime, offset); offset += 2;
        
        // Joystick data
        for (let i = 0; i < 6; i++) {
            const joy = this.controlState.joysticks[i];

            for (let a = 0; a < 12; a++) {
                const axisValue = Math.max(-127, Math.min(127, Math.round(joy.axes[a] * 127)));
                buffer.writeInt8(axisValue, offset); offset += 1;
            }

            buffer.writeUInt32BE(joy.buttons, offset); offset += 4;
            buffer.writeInt16BE(joy.pov, offset); offset += 2;
        }

        const gameDataBytes = Buffer.from(this.controlState.gameData, 'utf8');
        buffer.writeUInt8(Math.min(gameDataBytes.length, 32), offset); offset += 1;
        gameDataBytes.copy(buffer, offset, 0, Math.min(gameDataBytes.length, 32));
        offset += 32;
        
        return buffer.slice(0, offset);
    }
    
    handleRobotMessage(message, rinfo) {
        if (message.length < 8) {
            return; // invalidity handler
        }
        
        let offset = 0;
        
        const sequenceNum = message.readUInt16BE(offset); offset += 2;
        const commVersion = message.readUInt8(offset); offset += 1;
        
        // Robot status
        const statusByte = message.readUInt8(offset); offset += 1;
        this.robotState.brownedOut = !!(statusByte & 0x10);
        this.robotState.systemWatchdog = !!(statusByte & 0x02);
        
        // Battery voltage
        if (message.length > offset + 1) {
            this.robotState.batteryVoltage = message.readUInt16BE(offset) / 256.0; offset += 2;
        }
        
        // CAN utilization
        if (message.length > offset) {
            this.robotState.canUtilization = message.readUInt8(offset); offset += 1;
        }
        
        // WiFi signal strength
        if (message.length > offset) {
            this.robotState.wifiDB = message.readInt8(offset); offset += 1;
        }
        
        // WiFi bandwidth
        if (message.length > offset + 1) {
            this.robotState.wifiMB = message.readUInt16BE(offset) / 1000.0; offset += 2;
        }
        
        // Version strings (if present)
        if (message.length > offset + 20) {
            this.robotState.dsVersion = message.toString('utf8', offset, offset + 8).replace(/\0/g, ''); offset += 8;
            this.robotState.pcmVersion = message.toString('utf8', offset, offset + 8).replace(/\0/g, ''); offset += 8;
            this.robotState.pdpVersion = message.toString('utf8', offset, offset + 8).replace(/\0/g, ''); offset += 8;
            this.robotState.radioVersion = message.toString('utf8', offset, offset + 8).replace(/\0/g, ''); offset += 8;
        }
        
        this.emit('robotStatus', this.robotState);
    }
    
    // control methods
    setEnabled(enabled) {
        this.robotState.enabled = enabled;
        this.emit('stateChange', { enabled });
    }
    
    setMode(mode) {
        if (['teleop', 'auto', 'test'].includes(mode)) {
            this.robotState.mode = mode;
            this.emit('stateChange', { mode });
        }
    }
    
    setEmergencyStop(stop) {
        this.robotState.emergencyStop = stop;
        this.emit('stateChange', { emergencyStop: stop });
    }
    
    updateJoystick(joystickId, axes, buttons, pov = -1) {
        if (joystickId >= 0 && joystickId < 6) {
            this.controlState.joysticks[joystickId].axes = axes.slice(0, 12);
            this.controlState.joysticks[joystickId].buttons = buttons;
            this.controlState.joysticks[joystickId].pov = pov;
            this.emit('joystickUpdate', { joystickId, axes, buttons, pov });
        }
    }
    
    setAlliance(alliance, position) {
        this.controlState.alliance = alliance;
        this.controlState.position = position;
        this.emit('stateChange', { alliance, position });
    }
    
    setMatchTime(time) {
        this.controlState.matchTime = time;
    }
    
    setGameData(data) {
        this.controlState.gameData = data.substring(0, 32);
    }
    
    // check stuff
    getRobotState() {
        return { ...this.robotState };
    }
    
    getControlState() {
        return { ...this.controlState };
    }
    
    isConnected() {
        return this.connected;
    }
}

module.exports = FRCProtocol;
