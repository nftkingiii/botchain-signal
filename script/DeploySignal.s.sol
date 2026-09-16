pragma solidity ^0.8.24;
import {Script} from "forge-std/Script.sol";
import {SignalAnchor} from "../src/SignalAnchor.sol";

contract DeploySignal is Script {
    function run() external returns (SignalAnchor deployed) {
        // Preparation-only dry run. No broadcast or private key is used.
        deployed = new SignalAnchor();
    }
}
