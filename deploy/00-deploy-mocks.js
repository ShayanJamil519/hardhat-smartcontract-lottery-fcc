const { network, ethers } = require('hardhat')
const { developmentChains } = require('../helper-hardhat-config')
    // ==============================================================

const BASE_FEE = ethers.utils.parseEther('0.25') // "250000000000000000" => 0.25 is this the premium in LINK i.e: basFee
const GAS_PRICE_LINK = 1e9 // 1e9 = 1000000000 link per gas, is this the gas lane  i.e: 0.000000001 LINK per gas

module.exports = async function({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    const args = [BASE_FEE, GAS_PRICE_LINK]

    if (developmentChains.includes(network.name)) {
        log('Local network detected! Deploying mocks...')
            // deploy a mock vrfCoordinator
        await deploy('VRFCoordinatorV2Mock', {
            // VRFCoordinatorV2Mock takes two args : baseFee, gasPriceLink
            from: deployer,
            log: true,
            args: args,
        })
        log('Mocks Deployed!')
        log('----------------------------------------------------------')
    }
}

module.exports.tags = ['all', 'mocks']