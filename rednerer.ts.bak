import sessionRecordingData from '../session_recording.json';
import rrwebPlayer from 'rrweb-player';

export const TestPage = ({ navigate }: TestPageProps) => {
    const playerContainerRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const playerInstanceRef = useRef<any>(null);

    const [activeTab, setActiveTab] = useState<'network' | 'console'>('network');
    const [logsData, setLogsData] = useState<ProcessedData>({
        networkRequests: [],
        consoleLogs: [],
    });
    const [logsLoading, setLogsLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    // Copy data to clipboard
    const handleCopyData = async () => {
        let dataToCopy: any;

        if (activeTab === 'network') {
            dataToCopy = logsData.networkRequests;
        } else {
            // For console logs, convert timestamps to relative values
            if (logsData.consoleLogs.length > 0) {
                const firstTimestamp = logsData.consoleLogs[0].timestamp;
                dataToCopy = logsData.consoleLogs.map(log => ({
                    ...log,
                    timestamp: log.timestamp - firstTimestamp // Relative timestamp in milliseconds
                }));
            } else {
                dataToCopy = logsData.consoleLogs;
            }
        }

        try {
            await navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };


    // Fetch recording data
    useEffect(() => {

        const initializePlayer = async () => {
            if (!playerContainerRef.current) return;

            try {
                setLoading(true);
                setError(null);

                const recordingData = await sessionRecordingData;

                if (playerInstanceRef.current) {
                    playerContainerRef.current.innerHTML = '';
                }

                playerInstanceRef.current = new rrwebPlayer({
                    target: playerContainerRef.current,
                    props: {
                        events: recordingData,
                        width: 1024,
                        height: 768,
                        autoPlay: false,
                        showController: true,
                        showDebug: false,
                        skipInactive: true,
                        speed: 1,
                        speedOption: [0.5, 1, 2, 4, 8],
                        tags: {},
                        // Custom styling for dark theme
                        UNSAFE_replayCanvas: undefined,
                    },
                });

                setLoading(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                setLoading(false);
            }
        };

        initializePlayer();

        return () => {
            if (playerContainerRef.current) {
                playerContainerRef.current.innerHTML = '';
            }
            playerInstanceRef.current = null;
        };
    }, []);

    // Fetch logs data
    useEffect(() => {
        const fetchLogs = async () => {
            try {
                setLogsLoading(true);
                console.log('Fetching logs from API...');

                const response = await fetch(
                    '/api/browserbase/v1/sessions/a12d6db4-ff15-4acf-8cbe-736a4823e7d6/logs'
                );

                console.log('Logs response status:', response.status);

                if (!response.ok) {
                    throw new Error(`Failed to fetch logs: ${response.status}`);
                }

                const rawData = await response.json();
                console.log('Raw logs data:', rawData);
                console.log('Data type:', Array.isArray(rawData) ? 'array' : typeof rawData);
                console.log('Data length:', Array.isArray(rawData) ? rawData.length : 'N/A');

                const events: CDPEvent[] = Array.isArray(rawData) ? rawData : [];
                const processed = processCDPEvents(events);
                console.log('Processed data:', processed);
                setLogsData(processed);
            } catch (err) {
                console.error('Error fetching logs:', err);
            } finally {
                setLogsLoading(false);
            }
        };

        fetchLogs();
    }, []);

    return (
        <div className="container mx-auto px-4 py-12 animate-in fade-in duration-500">
            <div className="mb-6">
                <Button
                    variant="ghost"
                    onClick={() => navigate('/')}
                    className="pl-0 hover:bg-transparent hover:text-blue-600"
                >
                    <ArrowRight className="mr-2 h-4 w-4 rotate-180" /> Back to Home
                </Button>
            </div>

            <h1 className="text-3xl font-bold text-gray-900 mb-8">Session Viewer</h1>

            {/* Recording Player */}
            {loading && (
                <div className="flex items-center justify-center py-24 bg-gray-50 rounded-xl mb-8">
                    <div className="text-center">
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-gray-600">Loading recording...</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-8">
                    <h3 className="text-red-900 font-semibold mb-2">Error Loading Recording</h3>
                    <p className="text-red-700 text-sm">{error}</p>
                </div>
            )}


            <div
                ref={playerContainerRef}
                className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-lg mb-8"
                style={{ minHeight: loading ? '0' : '800px' }}
            ></div>

            {/* Tabs and Logs Section */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-lg">
                {/* Tab Navigation */}
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50">
                    <div className="flex">
                        <button
                            onClick={() => setActiveTab('network')}
                            className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'network'
                                ? 'border-b-2 border-blue-600 text-blue-600 bg-white'
                                : 'text-gray-600 hover:text-gray-900'
                                }`}
                        >
                            Network
                        </button>
                        <button
                            onClick={() => setActiveTab('console')}
                            className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'console'
                                ? 'border-b-2 border-blue-600 text-blue-600 bg-white'
                                : 'text-gray-600 hover:text-gray-900'
                                }`}
                        >
                            Console
                        </button>
                        <div className="px-6 py-3 text-sm text-gray-400">DOM</div>
                        <div className="px-6 py-3 text-sm text-gray-400">Events</div>
                        <div className="px-6 py-3 text-sm text-gray-400">🔥 Stagehand</div>
                    </div>

                    {/* Copy Button */}
                    <button
                        onClick={handleCopyData}
                        className="mr-4 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2"
                        disabled={logsLoading}
                    >
                        {copied ? (
                            <>
                                <Check size={14} className="text-green-600" />
                                <span className="text-green-600">Copied!</span>
                            </>
                        ) : (
                            <>
                                <Copy size={14} />
                                <span>Copy {activeTab === 'network' ? 'Network' : 'Console'} Data</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="min-h-[400px]">
                    {logsLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="text-center">
                                <Clock className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                                <p className="text-gray-600 text-sm">Loading logs...</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Debug Info */}
                            <div className="p-3 bg-yellow-50 border-b border-yellow-200 text-xs">
                                <strong>Debug:</strong> Network Requests: {logsData.networkRequests.length} | Console Logs: {logsData.consoleLogs.length}
                            </div>

                            {activeTab === 'network' && <NetworkWaterfall requests={logsData.networkRequests} />}
                            {activeTab === 'console' && <ConsoleLog logs={logsData.consoleLogs} />}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};