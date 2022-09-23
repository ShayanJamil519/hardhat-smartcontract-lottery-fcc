const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

developmentChains.includes(network.name) ?
    describe.skip :
    describe("Raffle", function() {
        let raffle, raffleEntranceFee, deployer // player
        beforeEach(async function() {
            deployer = (await getNamedAccounts()).deployer
            raffle = await ethers.getContract("Raffle", deployer)
            raffleEntranceFee = await raffle.getEntranceFee()
        })
        describe("fulfillRandomWords", function() {
            it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function() {
                // enter the raffle
                console.log("Setting up test...")
                const startingTimeStamp = await raffle.getLatestTimeStamp()
                const accounts = await ethers.getSigners()

                console.log("Setting up Listener...")

                await new Promise(async(resolve, reject) => {
                    raffle.once("WinnerPicked", async() => {
                            console.log("WinnerPicked event fired!")

                            try {
                                // adding our asserts here
                                const recentWinner = await raffle.getRecentWinner()
                                const raffleState = await raffle.getRaffleState()
                                const winnerEndingBalance = await accounts[0].getBalance()
                                const endingTimeStamp = await raffle.getLatestTimeStamp()

                                await expect(raffle.getPlayer(0)).to.be.reverted
                                assert.equal(recentWinner.toString(), accounts[0].address)
                                assert.equal(raffleState, 0)
                                assert.equal(winnerEndingBalance.toString(), winnerStartingBalance.add(raffleEntranceFee).toString())
                                assert(endingTimeStamp > startingTimeStamp)

                                resolve()
                            } catch (e) {
                                console.log(e)
                                reject(e)
                            }
                        })
                        // Then entering the raffle
                    const tx = await raffle.enterRaffle({ value: raffleEntranceFee })
                    await tx.wait(2)
                    const winnerStartingBalance = await accounts[0].getBalance()

                    // and this code won't complete until our listener has finished listening!
                })

                // setup listener before we enter the raffle
                // Just in case the blockchain moves REALLY fast
            })
        })
    })