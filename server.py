import sys
import os
import webbrowser
import socket
import sqlite3
import json
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8000
DB_FILE = 'users.db'

CYBER_COORDINATES = {
    "District 09": { 'x': 80, 'y': 150 },
    "Kabuki Market": { 'x': 150, 'y': 80 },
    "Arasaka Tower": { 'x': 220, 'y': 150 },
    "Chiba slums": { 'x': 150, 'y': 200 }
}

# Define starting states for character classes
CHARACTER_TEMPLATES = {
    'operative': {
        'character_name': 'Elias Vance',
        'level': 24,
        'strength': 64,
        'intelligence': 88,
        'charisma': 42,
        'xp': 2200,
        'current_location': 'District 09',
        'threat_level': 'MEDIUM',
        'inventory': [
            { 'id': 'plasma_blade', 'name': 'Plasma Dagger', 'type': 'weapon', 'quantity': 1, 'description': 'A vibrating plasma blade. Cuts through carbon-fiber plate easily.' },
            { 'id': 'neural_chip', 'name': 'Neural Implant', 'type': 'hardware', 'quantity': 1, 'description': 'High-frequency AI co-processor. Improves system buffer size.' },
            { 'id': 'cred_key', 'name': 'Syndicate Cred-Key', 'type': 'currency', 'quantity': 1, 'description': 'Contains encrypted syndicate credits.' },
            { 'id': 'sec_pass', 'name': 'Arasaka Passkey', 'type': 'quest', 'quantity': 1, 'description': 'Access card retrieved from a corporate courier.' }
        ],
        'quests': [
            { 'id': 'chrome_ghost', 'name': 'The Chrome Ghost', 'description': 'Infiltrate the Arasaka sub-level 4 to retrieve the data drive. Avoid patrolling sentinels.', 'status': 'active', 'type': 'main' },
            { 'id': 'static_wire', 'name': 'Static in the Wire', 'description': 'Investigate the recurring signal interference in the neon district.', 'status': 'active', 'type': 'side' },
            { 'id': 'memory_frags', 'name': 'Memory Fragments', 'description': 'The city never forgets, it only overwrites. Piece together the clues about Vance\'s forgotten past.', 'status': 'active', 'type': 'lore' }
        ],
        'story_log': [
            { 'role': 'story', 'text': 'The rain in District 09 doesn\'t just fall; it sticks. It\'s a heavy, chemically-scented slurry that glazes the carbon-fiber towers in a shimmering, toxic sheen. You adjust the collar of your synth-leather coat, the internal heater humming a low, reassuring tune against the biting dampness.' },
            { 'role': 'dialogue', 'text': '[DIALOGUE: KHAELEN] "If you lose them now, we lose the drive. And if we lose the drive, the Syndicate doesn\'t see the sunrise. Do you copy?"' },
            { 'role': 'story', 'text': 'You pause beneath the flicker of a malfunctioning holoboard. A [PERCEPTION] check reveals a faint trail of disrupted data particles—shimmering blue motes that defy the laws of physics. They lead toward a narrow alleyway where the walls seem to pulse like wet, exposed muscle, and the air is thick with the copper tang of metallic blood and the sweet, cloying stench of rot.' }
        ],
        'terminal_logs': [
            { 'type': 'system', 'text': '[SYSTEM] BOOTING NEURAL_LINK_V4.2.1...' },
            { 'type': 'system', 'text': '[SYSTEM] ESTABLISHING SECURE HANDSHAKE...' },
            { 'type': 'system', 'text': '[SYSTEM] BYPASSING REGIONAL FIREWALLS... DONE.' },
            { 'type': 'ai-talk', 'text': 'AI_CORE: The data streams you\'re looking for aren\'t just encrypted; they\'re fragmented across the city\'s power grid. To find the source, you\'ll need to initiate a localized blackout. Are you prepared for the fallout?' },
            { 'type': 'roll-result', 'text': '[PERCEPTION CHECK: SUCCESS] - HotScale flicker in the AI\'s vocal synthesis sub-routine. It\'s lying about the fallout.' }
        ],
        'map_connections': []
    },
    'netrunner': {
        'character_name': 'Kira Thorn',
        'level': 18,
        'strength': 38,
        'intelligence': 95,
        'charisma': 47,
        'xp': 1400,
        'current_location': 'Kabuki Market',
        'threat_level': 'LOW',
        'inventory': [
            { 'id': 'cyberdeck', 'name': 'Breaching Cyberdeck', 'type': 'hardware', 'quantity': 1, 'description': 'Equipped with custom siphoning utilities and standard icepicks.' },
            { 'id': 'datacoder', 'name': 'Datacoder Module', 'type': 'hardware', 'quantity': 1, 'description': 'Improves raw bitstream decryption speeds.' },
            { 'id': 'noodle_coupon', 'name': 'Noodle Bar Token', 'type': 'currency', 'quantity': 3, 'description': 'Exchangeable for hot bowls of syn-noodles in Kabuki.' }
        ],
        'quests': [
            { 'id': 'hack_grid', 'name': 'Breaching the Grid', 'description': 'Infiltrate the district relay of Kabuki Market to trace the rogue signal broadcast.', 'status': 'active', 'type': 'main' },
            { 'id': 'memory_frags', 'name': 'Memory Fragments', 'description': 'Decrypt the encrypted memory chunks locked in your neural banks.', 'status': 'active', 'type': 'lore' }
        ],
        'story_log': [
            { 'role': 'story', 'text': 'You sit on a plastic stool at the edge of Kabuki Market, a warm bowl of synthetic ramen heating your fingertips. Above you, huge neon holograms of koi fish swim lazily through the humid night air. Your HUD displays lines of scroll code. A private handshake alert triggers on your optics...' },
            { 'role': 'dialogue', 'text': '[DIALOGUE: AI_CORE] "Kira. We detected a packet leak on your sub-deck. Someone has siphoned your location logs. They are tracking you right now."' }
        ],
        'terminal_logs': [
            { 'type': 'system', 'text': '[SYSTEM] DATA DECK ONLINE. BUFFER: OK.' },
            { 'type': 'system', 'text': '[SYSTEM] PACKET SNIFFER DEPLOYED.' },
            { 'type': 'roll-result', 'text': '[INTELLIGENCE CHECK: SUCCESS] - Siphoned regional telemetry feed. The leak originated from District 09.' }
        ],
        'map_connections': []
    },
    'samurai': {
        'character_name': 'Jaxen Sterling',
        'level': 28,
        'strength': 90,
        'intelligence': 45,
        'charisma': 45,
        'xp': 3500,
        'current_location': 'Chiba slums',
        'threat_level': 'HIGH',
        'inventory': [
            { 'id': 'katana', 'name': 'Monofilament Katana', 'type': 'weapon', 'quantity': 1, 'description': 'A molecularly sharp katana blade. Cuts through thick iron walls.' },
            { 'id': 'subdermal_armor', 'name': 'Subdermal Plating', 'type': 'hardware', 'quantity': 1, 'description': 'Reinforced titanium layer under the skin. Reduces impact forces.' },
            { 'id': 'cred_key', 'name': 'Syndicate Cred-Key', 'type': 'currency', 'quantity': 1, 'description': 'Contains encrypted syndicate credits.' }
        ],
        'quests': [
            { 'id': 'clear_sector', 'name': 'Clear the Sector', 'description': 'Banish local Arasaka patrol squads enforcing blackouts in Chiba slums.', 'status': 'active', 'type': 'main' },
            { 'id': 'memory_frags', 'name': 'Memory Fragments', 'description': 'Seek out clues in the slums detailing your military discharge history.', 'status': 'active', 'type': 'lore' }
        ],
        'story_log': [
            { 'role': 'story', 'text': 'The rain here tastes of rust and sulfur. You stand in a trash-littered alleyway of the Chiba slums, steam vents blowing hot fog around your carbon boots. In the distance, an Arasaka security scanner drone sweeps red lasers across the shanties. Your neural grip fits the monofilament katana handle...' },
            { 'role': 'dialogue', 'text': '[DIALOGUE: KHAELEN] "Jaxen, enforcers are moving into your block. They have order sheets to flatline you. Get out or clear them out."' }
        ],
        'terminal_logs': [
            { 'type': 'system', 'text': '[SYSTEM] BIOMETRICS ONLINE. TARGET BUFFER LOADED.' },
            { 'type': 'system', 'text': '[SYSTEM] WARNING: WEAPONS UNLOCKED.' },
            { 'type': 'roll-result', 'text': '[STRENGTH CHECK: SUCCESS] - Sliced Arasaka scout drone in half. Scanner offline.' }
        ],
        'map_connections': []
    }
}

class RPGRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable caching to ensure updates reflect immediately during play
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_POST(self):
        if self.path == '/api/register':
            self.handle_register()
        elif self.path == '/api/login':
            self.handle_login()
        elif self.path == '/api/save_game':
            self.handle_save_game()
        else:
            self.send_error(404, "Endpoint not found")

    def handle_register(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            req = json.loads(post_data.decode('utf-8'))
            username = req.get('username', '').strip()
            password = req.get('password', '').strip()
            char_class = req.get('character_class', '').strip()

            if not username or not password or char_class not in CHARACTER_TEMPLATES:
                self.send_api_response(400, {'error': 'Invalid parameters. All credentials required.'})
                return

            password_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
            template = CHARACTER_TEMPLATES[char_class]

            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            
            # Check if user already exists
            cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
            if cursor.fetchone():
                conn.close()
                self.send_api_response(400, {'error': 'Username already registered.'})
                return

            # Insert new user with character class starting progresses
            cursor.execute('''
                INSERT INTO users (
                    username, password_hash, character_class, character_name, level, 
                    strength, intelligence, charisma, xp, current_location, threat_level, 
                    inventory, quests, story_log, terminal_logs, map_connections
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                username, password_hash, char_class, template['character_name'], template['level'],
                template['strength'], template['intelligence'], template['charisma'], template['xp'],
                template['current_location'], template['threat_level'],
                json.dumps(template['inventory']), json.dumps(template['quests']),
                json.dumps(template['story_log']), json.dumps(template['terminal_logs']),
                json.dumps(template['map_connections'])
            ))
            
            conn.commit()
            conn.close()
            
            self.send_api_response(200, {'success': True, 'username': username})
            print(f"Registered user: {username} [{char_class}]")

        except Exception as e:
            print(f"Registration Error: {e}")
            self.send_api_response(500, {'error': f'Database write error: {str(e)}'})

    def handle_login(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            req = json.loads(post_data.decode('utf-8'))
            username = req.get('username', '').strip()
            password = req.get('password', '').strip()

            if not username or not password:
                self.send_api_response(400, {'error': 'Username and password required.'})
                return

            password_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()

            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("SELECT * FROM users WHERE username = ? AND password_hash = ?", (username, password_hash))
            row = cursor.fetchone()
            conn.close()

            if not row:
                self.send_api_response(401, {'error': 'Invalid credentials. Access denied.'})
                return

            # Reconstruct profile structure to push to frontend
            profile = {
                'username': row['username'],
                'player': {
                    'name': row['character_name'],
                    'class': row['character_class'],
                    'level': row['level'],
                    'stats': {
                        'strength': row['strength'],
                        'intelligence': row['intelligence'],
                        'charisma': row['charisma']
                    },
                    'xp': row['xp'],
                    'xpToNextLevel': 3000
                },
                'inventory': json.loads(row['inventory']),
                'quests': json.loads(row['quests']),
                'currentLocation': row['current_location'],
                'threatLevel': row['threat_level'],
                'exploredLocations': {
                    row['current_location']: {
                        'name': row['current_location'],
                        'description': 'Main sector.',
                        'coordinates': CYBER_COORDINATES.get(row['current_location'], {'x': 150, 'y': 125})
                    }
                },
                'storyLog': json.loads(row['story_log']),
                'terminalLogs': json.loads(row['terminal_logs']),
                'mapConnections': json.loads(row['map_connections'])
            }

            self.send_api_response(200, profile)
            print(f"Logged in user: {username}")

        except Exception as e:
            print(f"Login Error: {e}")
            self.send_api_response(500, {'error': f'Database query error: {str(e)}'})

    def handle_save_game(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            req = json.loads(post_data.decode('utf-8'))
            username = req.get('username', '')
            state_data = req.get('state', {})

            if not username or not state_data:
                self.send_api_response(400, {'error': 'Invalid payload.'})
                return

            player = state_data.get('player', {})
            stats = player.get('stats', {})

            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            
            cursor.execute('''
                UPDATE users SET
                    level = ?, strength = ?, intelligence = ?, charisma = ?, xp = ?,
                    current_location = ?, threat_level = ?, inventory = ?, quests = ?,
                    story_log = ?, terminal_logs = ?, map_connections = ?
                WHERE username = ?
            ''', (
                player.get('level', 24), stats.get('strength', 50), stats.get('intelligence', 50), stats.get('charisma', 50),
                player.get('xp', 0), state_data.get('currentLocation', 'District 09'), state_data.get('threatLevel', 'MEDIUM'),
                json.dumps(state_data.get('inventory', [])), json.dumps(state_data.get('quests', [])),
                json.dumps(state_data.get('storyLog', [])), json.dumps(state_data.get('terminalLogs', [])),
                json.dumps(state_data.get('mapConnections', [])),
                username
            ))
            
            conn.commit()
            conn.close()
            
            self.send_api_response(200, {'success': True})
            print(f"Synced progress for: {username}")

        except Exception as e:
            print(f"Sync Progress Error: {e}")
            self.send_api_response(500, {'error': f'Database sync write error: {str(e)}'})

    def send_api_response(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            character_class TEXT NOT NULL,
            character_name TEXT NOT NULL,
            level INTEGER,
            strength INTEGER,
            intelligence INTEGER,
            charisma INTEGER,
            xp INTEGER,
            current_location TEXT,
            threat_level TEXT,
            inventory TEXT,
            quests TEXT,
            story_log TEXT,
            terminal_logs TEXT,
            map_connections TEXT
        )
    ''')
    conn.commit()
    conn.close()
    print("SQLite database verified successfully.")

def check_assets():
    required = ['index.html', 'login.html', 'style.css', 'app.js']
    missing = [f for f in required if not os.path.exists(f)]
    if missing:
        print(f"Error: Missing files: {', '.join(missing)}")
        return False
    print("All assets exist.")
    return True

def find_free_port(start_port):
    port = start_port
    while port < start_port + 100:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                port += 1
    return start_port

def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--test-assets':
        if check_assets():
            sys.exit(0)
        else:
            sys.exit(1)

    init_db()

    env_port = os.environ.get('PORT')
    if env_port:
        port = int(env_port)
        server_address = ('0.0.0.0', port)
        print(f"Cloud environment detected. Starting server on 0.0.0.0:{port}...")
    else:
        port = find_free_port(PORT)
        server_address = ('127.0.0.1', port)
        url = f"http://127.0.0.1:{port}/login.html"
        print(f"Starting local server on {url}...")
        webbrowser.open(url)
    
    httpd = ThreadingHTTPServer(server_address, RPGRequestHandler)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        sys.exit(0)

if __name__ == '__main__':
    main()
