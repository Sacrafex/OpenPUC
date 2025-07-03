# OpenPUC - Open Programming Utility Console

A modern, cross-platform desktop application designed specifically for FRC (FIRST Robotics Competition) teams. OpenPUC provides comprehensive documentation, robot control capabilities, and development tools all in one unified interface.

## Features

### Documentation System

- **Built-in Documentation**: Comprehensive code examples and guides for FRC programming
- **External Search**: Search across WPILib docs, Chief Delphi, GitHub, and other FRC resources
- **Code Copy**: One-click code copying with syntax highlighting
- **Search & Filter**: Real-time search across all documentation with tag-based filtering
- **Category Organization**: Well-organized content covering motors, sensors, drivetrain, autonomous, and more

### Robot Control Interface

- **Real-time Robot Connection**: Connect to and monitor FRC robots via multiple protocols
- **Robot State Management**: Enable/disable robot with visual feedback
- **Mode Switching**: Switch between Teleop, Autonomous, and Test modes
- **Live Telemetry**: Monitor battery voltage, signal strength, CAN utilization, and bandwidth
- **Emergency Stop**: Quick emergency stop functionality for safety

### Controller Support

- **Gamepad Integration**: Full support for Xbox and PlayStation controllers
- **Real-time Input Display**: Live visualization of controller axes and button states
- **Deadzone Configuration**: Adjustable deadzone settings for precise control
- **Vibration Testing**: Test controller haptic feedback

### System Features

- **Auto-updater**: Automatic updates to keep the application current
- **Team Configuration**: Store and manage team number and connection settings
- **Connection Monitoring**: Multi-address robot ping with automatic fallback
- **Live Logging**: Real-time robot communication and system status logging

## Installation

### Download the latest file corresponding to your operating system [here](https://github.com/Sacrafex/OpenPUC/releases).

## Contribution Launching

### Prerequisites

- Node.js 16.x or higher
- npm or yarn package manager

### Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/OpenPUC.git
   cd OpenPUC
   ```

2. Navigate to the client directory:

   ```bash
   cd client
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the application:

   ```bash
   npm start
   ```

## Usage

### Getting Started

1. Launch OpenPUC
2. Configure your FRC team number in the Settings section
3. The application will automatically attempt to connect to your robot using multiple addresses

### Robot Connection

OpenPUC attempts connection using multiple methods:

- mDNS: `roboRIO-####-FRC.local`
- Static IP: `10.TE.AM.2`
- USB: `172.22.11.2`
- Alternative mDNS: `roborio-####-frc.local`

### Documentation Usage

- Browse built-in documentation by category
- Use the search bar for quick code lookup
- Click the copy button to copy code examples
- Switch to external search for broader FRC resources

### Controller Setup

1. Connect your controller (Xbox or PlayStation)
2. Select it from the controller dropdown
3. Adjust deadzone settings as needed
4. Use the vibration test to verify functionality

## Technical Details

### Architecture

- **Frontend**: Electron with HTML/CSS/JavaScript
- **Backend**: Node.js with Electron main process
- **Communication**: FRC 2024 protocol implementation
- **Controller**: Native gamepad API integration

### FRC Protocol Support

- FRC 2024 protocol implementation
- UDP-based robot communication
- Real-time telemetry data parsing
- Robot state synchronization

### File Structure

```text
client/
├── index.html          # Main application interface
├── main.js            # Electron main process
├── frc-protocol.js    # FRC protocol implementation
├── controller-manager.js # Controller input handling
├── docs.json          # Built-in documentation data
└── package.json       # Application configuration
```

## Development

### Building

To build the application for distribution:

```bash
npm run build
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with actual FRC hardware when possible
5. Submit a pull request

### Adding Documentation

To add new documentation entries, edit `docs.json`:

```json
{
  "categories": {
    "category_name": {
      "name": "Display Name",
      "items": [
        {
          "title": "Example Title",
          "description": "What this code does",
          "code": "// Your code example here",
          "language": "java",
          "tags": ["tag1", "tag2"]
        }
      ]
    }
  }
}
```

## Compatibility

### Operating Systems

- Windows 10/11
- Linux (Ubuntu 18.04+, other distributions)

### Robot Requirements

- roboRIO running FRC 2024 robot code
- Network connectivity (WiFi, USB, or Ethernet)
- Standard FRC networking configuration

### Controllers

- Xbox One/Series controllers
- PlayStation 4/5 controllers
- Generic controllers with standard gamepad API support

## License

This project is open source and available under the MIT License.

## Support

For questions, issues, or contributions:

- Open an issue on GitHub
- Check existing documentation and examples
- Consult FRC programming resources and community forums

## Acknowledgments

Built for the FRC community to streamline robot development and provide quick access to essential programming resources. Special thanks to the WPILib team and FRC mentors who make robotics education possible.
