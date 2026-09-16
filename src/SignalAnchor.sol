pragma solidity ^0.8.24;

contract SignalAnchor {
    error EmptyIncident();
    error InvalidSource();

    event ObservationAnchored(bytes32 indexed observationId, string incident, string source, uint64 observedAt);

    string public constant PRODUCT = "Signal";
    uint256 public constant TARGET_CHAIN_ID = 968;

    function anchorObservation(bytes32 observationId, string calldata incident, string calldata source) external {
        if (bytes(incident).length == 0) revert EmptyIncident();
        if (bytes(source).length == 0) revert InvalidSource();
        emit ObservationAnchored(observationId, incident, source, uint64(block.timestamp));
    }
}
