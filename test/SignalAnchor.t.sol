pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {SignalAnchor} from "../src/SignalAnchor.sol";

contract SignalAnchorTest is Test {
    SignalAnchor anchor;

    function setUp() public {
        anchor = new SignalAnchor();
    }

    function testProjectIdentity() public {
        assertEq(anchor.PRODUCT(), "Signal");
        assertEq(anchor.TARGET_CHAIN_ID(), 968);
    }

    function testAnchorObservationEmitsEvidence() public {
        vm.expectEmit(true, false, false, true);
        emit SignalAnchor.ObservationAnchored(bytes32(uint256(7)), "TreasuryRouter quiet", "rpc-quorum", 1);
        anchor.anchorObservation(bytes32(uint256(7)), "TreasuryRouter quiet", "rpc-quorum");
    }

    function testRejectsEmptyIncident() public {
        vm.expectRevert(SignalAnchor.EmptyIncident.selector);
        anchor.anchorObservation(bytes32(0), "", "rpc");
    }

    function testRejectsEmptySource() public {
        vm.expectRevert(SignalAnchor.InvalidSource.selector);
        anchor.anchorObservation(bytes32(0), "incident", "");
    }
}
