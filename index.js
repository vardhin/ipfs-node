import { create } from 'ipfs-core'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import readline from 'readline'

// Generate a random port number between min and max
function getRandomPort(min, max) {
    return Math.floor(Math.random() * (max - min) + min)
}

async function main() {
    // Generate unique ports for this instance
    const swarmPort = getRandomPort(4002, 4999)
    const wsPort = getRandomPort(5000, 5999)
    const apiPort = getRandomPort(6000, 6999)
    const gatewayPort = getRandomPort(7000, 7999)

    // Generate a unique repo path
    const repoPath = `./ipfs-repo-${swarmPort}`

    console.log('Starting IPFS node...')
    const node = await create({
        repo: repoPath,  // Use unique repo path
        config: {
            Addresses: {
                Swarm: [
                    `/ip4/0.0.0.0/tcp/${swarmPort}`,
                    `/ip4/127.0.0.1/tcp/${wsPort}/ws`
                ],
                API: `/ip4/127.0.0.1/tcp/${apiPort}`,
                Gateway: `/ip4/127.0.0.1/tcp/${gatewayPort}`
            },
            Bootstrap: [
                '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
                '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
                '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb'
            ],
            Pubsub: {
                Enabled: true,
                Router: 'gossipsub'
            }
        },
        start: true
    })

    console.log('IPFS node is ready')
    console.log(`Repository path: ${repoPath}`)
    console.log(`Swarm port: ${swarmPort}`)
    console.log(`WebSocket port: ${wsPort}`)
    console.log(`API port: ${apiPort}`)
    console.log(`Gateway port: ${gatewayPort}`)

    // Get node info
    const id = await node.id()
    console.log('Node ID:', id.id)
    console.log('Node addresses:')
    id.addresses.forEach(addr => console.log(`- ${addr}`))

    // Connect to the IPFS swarm
    console.log('\nConnecting to IPFS swarm...')
    try {
        const peers = await node.swarm.peers()
        console.log('Connected to', peers.length, 'peers')
    } catch (err) {
        console.error('Failed to connect to swarm:', err)
    }

    // Create interface for pubsub operations
    const pubsubInterface = {
        // Subscribe to a topic
        subscribe: async (topic) => {
            try {
                await node.pubsub.subscribe(topic, (msg) => {
                    const from = msg.from
                    const data = uint8ArrayToString(msg.data)
                    console.log(`\nReceived message on ${topic} from ${from}:`, data)
                })
                console.log(`Subscribed to topic: ${topic}`)
            } catch (err) {
                console.error('Failed to subscribe:', err)
            }
        },

        // Publish to a topic
        publish: async (topic, message) => {
            try {
                const msgUint8Array = uint8ArrayFromString(message)
                await node.pubsub.publish(topic, msgUint8Array)
                console.log(`Published message to ${topic}`)
            } catch (err) {
                console.error('Failed to publish:', err)
            }
        },

        // List subscribed topics
        listTopics: async () => {
            try {
                const topics = await node.pubsub.ls()
                console.log('\nSubscribed topics:')
                topics.forEach(topic => console.log(`- ${topic}`))
                return topics
            } catch (err) {
                console.error('Failed to list topics:', err)
            }
        },

        // List peers subscribed to a topic
        listPeers: async (topic) => {
            try {
                const peers = await node.pubsub.peers(topic)
                console.log(`\nPeers subscribed to ${topic}:`)
                peers.forEach(peer => console.log(`- ${peer}`))
                return peers
            } catch (err) {
                console.error('Failed to list peers:', err)
            }
        }
    }

    // Command line interface
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    console.log('\n=== IPFS PubSub Interface ===')
    console.log('Available commands:')
    console.log('1. sub <topic> - Subscribe to a topic')
    console.log('2. pub <topic> <message> - Publish message to a topic')
    console.log('3. topics - List subscribed topics')
    console.log('4. peers <topic> - List peers in a topic')
    console.log('5. info - Show node information')
    console.log('6. swarm - Show connected peers')
    console.log('7. quit - Exit the application')

    const processCommand = async (input) => {
        const [command, ...args] = input.trim().split(' ')

        switch (command) {
            case 'sub':
                if (!args[0]) {
                    console.log('Usage: sub <topic>')
                    break
                }
                await pubsubInterface.subscribe(args[0])
                break

            case 'pub':
                if (!args[0] || !args[1]) {
                    console.log('Usage: pub <topic> <message>')
                    break
                }
                const topic = args[0]
                const message = args.slice(1).join(' ')
                await pubsubInterface.publish(topic, message)
                break

            case 'topics':
                await pubsubInterface.listTopics()
                break

            case 'peers':
                if (!args[0]) {
                    console.log('Usage: peers <topic>')
                    break
                }
                await pubsubInterface.listPeers(args[0])
                break

            case 'info':
                console.log('\nNode ID:', id.id)
                console.log('Addresses:')
                id.addresses.forEach(addr => console.log(`- ${addr}`))
                break

            case 'swarm':
                const peers = await node.swarm.peers()
                console.log('\nConnected peers:', peers.length)
                peers.forEach(peer => {
                    console.log(`- ${peer.peer}: ${peer.addr}`)
                })
                break

            case 'quit':
                console.log('Shutting down...')
                await node.stop()
                process.exit(0)
                break

            default:
                console.log('Unknown command. Type help for available commands.')
        }
    }

    rl.on('line', async (input) => {
        try {
            await processCommand(input)
        } catch (err) {
            console.error('Error processing command:', err)
        }
        rl.prompt()
    })

    rl.prompt()

    // Handle cleanup
    process.on('SIGINT', async () => {
        console.log('\nShutting down IPFS node...')
        await node.stop()
        process.exit(0)
    })
}

// Start the application
main().catch(console.error)
