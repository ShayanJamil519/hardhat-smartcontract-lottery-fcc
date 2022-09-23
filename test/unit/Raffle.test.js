const { assert, expect } = require('chai')
const { network, getNamedAccounts, deployments, ethers } = require('hardhat')
const {
    developmentChains,
    networkConfig,
} = require('../../helper-hardhat-config')

!developmentChains.includes(network.name) ?
    describe.skip :
    describe('Raffle', function() {
        let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, interval, deployer // player
        const chainId = network.config.chainId
        beforeEach(async function() {
            deployer = (await getNamedAccounts()).deployer
            await deployments.fixture(['all']) // deploying mocks as well as raffle as both includes "all" tag
            raffle = await ethers.getContract('Raffle', deployer)
            vrfCoordinatorV2Mock = await ethers.getContract(
                'VRFCoordinatorV2Mock',
                deployer,
            )
            raffleEntranceFee = await raffle.getEntranceFee()
            interval = await raffle.getInterval()
                // raffle = raffleContract.connect(player) // Returns a new instance of the Raffle contract connected to player
        })
        describe('constructor', function() {
            it('Initializes the raffle correctly', async function() {
                // const raffleState = (await raffle.getRaffleState()).toString()
                const raffleState = await raffle.getRaffleState()

                assert.equal(raffleState.toString(), '0') // raffleState is a big number that's why we convert it to string
                assert.equal(interval.toString(), networkConfig[chainId]['interval'])
            })
        })

        describe('enterRaffle', function() {
                it("reverts when you don't pay enough", async function() {
                    await expect(raffle.enterRaffle()).to.be.revertedWith(
                            'Raffle__SendMoreToEnterRaffle',
                        ) // // is reverted when not paid enough or raffle is not open
                })

                it('records player when they enter', async function() {
                    await raffle.enterRaffle({ value: raffleEntranceFee })
                    const playerFromContract = await raffle.getPlayer(0)
                    assert.equal(playerFromContract, deployer)
                })

                it('emits event on enter', async function() {
                    await expect(
                        raffle.enterRaffle({ value: raffleEntranceFee }),
                    ).to.emit(
                        // emits RaffleEnter event if entered to index player(s) address
                        raffle,
                        'RaffleEnter',
                    )
                })
                it("doesn't allow entrance when raffle is calculating", async function() {
                    await raffle.enterRaffle({ value: raffleEntranceFee })
                        // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                    await network.provider.send('evm_increaseTime', [
                        interval.toNumber() + 1,
                    ])
                    await network.provider.request({ method: 'evm_mine', params: [] }) //  OR   await network.provider.send("evm_mine", [])
                        // we pretend to be a ChainLink keeper for a second
                    await raffle.performUpkeep([]) // changes the state to calculating for our comparison below
                    await expect(
                        raffle.enterRaffle({ value: raffleEntranceFee }),
                    ).to.be.revertedWith(
                        // is reverted as raffle is calculating
                        'Raffle__RaffleNotOpen',
                    )
                })
            })
            // =================================================
        describe('checkUpkeep', function() {
                it("returns false if people haven't sent any ETH", async function() {
                    await network.provider.send('evm_increaseTime', [
                        interval.toNumber() + 1,
                    ])
                    await network.provider.send('evm_mine', [])
                    const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                    assert(!upkeepNeeded)
                })
                it("returns false if raffle isn't open", async function() {
                    await raffle.enterRaffle({ value: raffleEntranceFee })
                    await network.provider.send('evm_increaseTime', [
                        interval.toNumber() + 1,
                    ])
                    await network.provider.send('evm_mine', [])
                    await raffle.performUpkeep([]) // OR performUpkeep("0x")  both represents empty bytes object
                    const raffleState = await raffle.getRaffleState()
                    const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                    assert.equal(raffleState.toString(), '1') // 1 means calculating state
                    assert.equal(upkeepNeeded, false)
                })
                it("returns false if enough time hasn't passed", async function() {
                    await raffle.enterRaffle({ value: raffleEntranceFee })
                    await network.provider.send('evm_increaseTime', [
                            interval.toNumber() - 5,
                        ]) // use a higher number here if this test fails
                    await network.provider.request({ method: 'evm_mine', params: [] })
                    const { upkeepNeeded } = await raffle.callStatic.checkUpkeep('0x') // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                    assert(!upkeepNeeded)
                })
                it('returns true if enough time has passed, has players, eth, and is open', async function() {
                    await raffle.enterRaffle({ value: raffleEntranceFee })
                    await network.provider.send('evm_increaseTime', [
                        interval.toNumber() + 1,
                    ])
                    await network.provider.request({ method: 'evm_mine', params: [] })
                    const { upkeepNeeded } = await raffle.callStatic.checkUpkeep('0x') // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                    assert(upkeepNeeded)
                })
            })
            // ============================================
        describe('performUpkeep', function() {
                it('can only run if checkupkeep is true', async function() {
                    await raffle.enterRaffle({ value: raffleEntranceFee })
                    await network.provider.send('evm_increaseTime', [
                        interval.toNumber() + 1,
                    ])
                    await network.provider.send('evm_mine', [])
                    const tx = await raffle.performUpkeep([])
                    assert(tx)
                })
                it('reverts if checkupkeep is false', async function() {
                    await expect(raffle.performUpkeep([])).to.be.revertedWith(
                        'Raffle__UpkeepNotNeeded',
                    )
                })
                it('updates the raffle state and emits a requestId event and calls the vrf coordinator', async function() {
                    await raffle.enterRaffle({ value: raffleEntranceFee })
                    await network.provider.send('evm_increaseTime', [
                        interval.toNumber() + 1,
                    ])
                    await network.provider.send('evm_mine', [])
                    const txResponse = await raffle.performUpkeep([]) // emits requestId
                    const txReceipt = await txResponse.wait(1) // waits 1 block
                    const raffleState = await raffle.getRaffleState() // updates state
                    const requestId = txReceipt.events[1].args.requestId
                    assert(requestId.toNumber() > 0)
                    assert(raffleState == 1) // 0 = open, 1 = calculating
                })
            })
            // ===================================
        describe('fulfillRandomWords', function() {
            beforeEach(async function() {
                await raffle.enterRaffle({ value: raffleEntranceFee }) // someone enter the lottery
                await network.provider.send('evm_increaseTime', [
                        interval.toNumber() + 1,
                    ]) // increase the time
                await network.provider.send('evm_mine', []) // min a new block
            })
            it('can only be called after performupkeep', async function() {
                    await expect(
                        vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address), // reverts if not fulfilled
                    ).to.be.revertedWith('nonexistent request')
                    await expect(
                        vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address), // reverts if not fulfilled
                    ).to.be.revertedWith('nonexistent request')
                })
                // This test is too big...
                // This test simulates users entering the raffle and wraps the entire functionality of the raffle
                // inside a promise that will resolve if everything is successful.
                // An event listener for the WinnerPicked is set up
                // Mocks of chainlink keepers and vrf coordinator are used to kickoff this winnerPicked event
                // All the assertions are done once the WinnerPicked event is fired
            it('picks a winner, resets the lottery, and sends money', async function() {
                const additionalEntrants = 3 // to test
                const startingAccountIndex = 1 // bcoz deployer = 0
                const accounts = await ethers.getSigners()
                    // i = 1; i < 4; i=i+1
                for (
                    let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++
                ) {
                    const accountConnectedRaffle = raffle.connect(accounts[i]) // Returns a new instance of the Raffle contract connected to player
                    await accountConnectedRaffle.enterRaffle({
                        value: raffleEntranceFee,
                    })
                }
                const startingTimeStamp = await raffle.getLatestTimeStamp() // stores starting timestamp (before we fire our event)
                    //  performUpkeep (mock being Chainlink keepers)
                    // fulfillRandomWords (mock being Chainlink  VRF)
                await new Promise(async(resolve, reject) => {
                    raffle.once('WinnerPicked', async() => {
                            console.log('WinnerPicked event fired!')
                                // assert throws an error if it fails, so we need to wrap
                                // it in a try/catch so that the promise returns event
                                // if it fails.
                            try {
                                const recentWinner = await raffle.getRecentWinner()
                                const raffleState = await raffle.getRaffleState()
                                const endingTimeStamp = await raffle.getLatestTimeStamp()
                                const numPlayers = await raffle.getNumberOfPlayers()
                                const winnerEndingBalance = await accounts[1].getBalance()
                                    // await expect(raffle.getPlayer(0)).to.be.reverted
                                assert.equal(numPlayers.toString(), '0')
                                assert.equal(raffleState, 0)
                                    // =================
                                assert.equal(
                                        winnerEndingBalance.toString(),
                                        winnerStartingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                        .add(
                                            raffleEntranceFee
                                            .mul(additionalEntrants)
                                            .add(raffleEntranceFee),
                                        )
                                        .toString(),
                                    )
                                    // =================
                                assert(endingTimeStamp > startingTimeStamp)
                            } catch (e) {
                                reject(e)
                            }

                            resolve()
                        })
                        // Setting up the listener
                        // kicking off the event by mocking the chainlink keepers and vrf coordinator and the listener will pick it up and resolve
                    const tx = await raffle.performUpkeep([])
                    const txReceipt = await tx.wait(1)
                    const winnerStartingBalance = await accounts[1].getBalance()
                    await vrfCoordinatorV2Mock.fulfillRandomWords(
                        txReceipt.events[1].args.requestId,
                        raffle.address,
                    )
                })
            })
        })
    })