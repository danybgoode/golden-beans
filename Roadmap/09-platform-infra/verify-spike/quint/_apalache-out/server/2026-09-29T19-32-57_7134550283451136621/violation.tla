---------------------------- MODULE counterexample ----------------------------

EXTENDS outbox_timed

(* Constant initialization state *)
ConstInit == TRUE

(* Initial state [_transition(0)] *)
State0 ==
  outbox_timed_outbox_deadByExhaustion = FALSE
    /\ outbox_timed_outbox_dests
      = SetAsFun({ <<"d1", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>>,
        <<"d2", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>> })
    /\ outbox_timed_outbox_expected = {}
    /\ outbox_timed_outbox_ingested = {}
    /\ outbox_timed_outbox_nextToken = 1
    /\ outbox_timed_outbox_replays = 0
    /\ outbox_timed_outbox_rows
      = SetAsFun({ <<
          <<"e1", "d1">>, [attempts |-> 0, status |-> "none", token |-> 0]
        >>,
        <<<<"e1", "d2">>, [attempts |-> 0, status |-> "none", token |-> 0]>>,
        <<<<"e2", "d1">>, [attempts |-> 0, status |-> "none", token |-> 0]>>,
        <<<<"e2", "d2">>, [attempts |-> 0, status |-> "none", token |-> 0]>> })
    /\ outbox_timed_outbox_sends
      = SetAsFun({ <<<<"e1", "d1">>, 0>>,
        <<<<"e1", "d2">>, 0>>,
        <<<<"e2", "d1">>, 0>>,
        <<<<"e2", "d2">>, 0>> })
    /\ outbox_timed_outbox_sentAfterTerminal = FALSE
    /\ outbox_timed_outbox_strandedInFlight = FALSE
    /\ outbox_timed_outbox_workers
      = SetAsFun({ <<
          "w1", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >>,
        <<
          "w2", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >> })

(* State1 [_transition(0)] *)
State1 ==
  outbox_timed_outbox_deadByExhaustion = FALSE
    /\ outbox_timed_outbox_dests
      = SetAsFun({ <<"d1", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>>,
        <<"d2", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>> })
    /\ outbox_timed_outbox_expected = { <<"e2", "d1">>, <<"e2", "d2">> }
    /\ outbox_timed_outbox_ingested = {"e2"}
    /\ outbox_timed_outbox_nextToken = 1
    /\ outbox_timed_outbox_replays = 0
    /\ outbox_timed_outbox_rows
      = SetAsFun({ <<
          <<"e1", "d1">>, [attempts |-> 0, status |-> "none", token |-> 0]
        >>,
        <<<<"e1", "d2">>, [attempts |-> 0, status |-> "none", token |-> 0]>>,
        <<<<"e2", "d1">>, [attempts |-> 0, status |-> "pending", token |-> 0]>>,
        <<<<"e2", "d2">>, [attempts |-> 0, status |-> "pending", token |-> 0]>> })
    /\ outbox_timed_outbox_sends
      = SetAsFun({ <<<<"e1", "d1">>, 0>>,
        <<<<"e1", "d2">>, 0>>,
        <<<<"e2", "d1">>, 0>>,
        <<<<"e2", "d2">>, 0>> })
    /\ outbox_timed_outbox_sentAfterTerminal = FALSE
    /\ outbox_timed_outbox_strandedInFlight = FALSE
    /\ outbox_timed_outbox_workers
      = SetAsFun({ <<
          "w1", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >>,
        <<
          "w2", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >> })

(* State2 [_transition(1)] *)
State2 ==
  outbox_timed_outbox_deadByExhaustion = FALSE
    /\ outbox_timed_outbox_dests
      = SetAsFun({ <<"d1", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>>,
        <<"d2", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>> })
    /\ outbox_timed_outbox_expected = { <<"e2", "d1">>, <<"e2", "d2">> }
    /\ outbox_timed_outbox_ingested = {"e2"}
    /\ outbox_timed_outbox_nextToken = 2
    /\ outbox_timed_outbox_replays = 0
    /\ outbox_timed_outbox_rows
      = SetAsFun({ <<
          <<"e1", "d1">>, [attempts |-> 0, status |-> "none", token |-> 0]
        >>,
        <<<<"e1", "d2">>, [attempts |-> 0, status |-> "none", token |-> 0]>>,
        <<<<"e2", "d1">>, [attempts |-> 0, status |-> "pending", token |-> 0]>>,
        <<
          <<"e2", "d2">>, [attempts |-> 0, status |-> "in_flight", token |-> 1]
        >> })
    /\ outbox_timed_outbox_sends
      = SetAsFun({ <<<<"e1", "d1">>, 0>>,
        <<<<"e1", "d2">>, 0>>,
        <<<<"e2", "d1">>, 0>>,
        <<<<"e2", "d2">>, 0>> })
    /\ outbox_timed_outbox_sentAfterTerminal = FALSE
    /\ outbox_timed_outbox_strandedInFlight = FALSE
    /\ outbox_timed_outbox_workers
      = SetAsFun({ <<
          "w1", [claimedAttempts |-> 0,
            key |-> <<"e2", "d2">>,
            phase |-> "claimed",
            result |-> "",
            token |-> 1]
        >>,
        <<
          "w2", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >> })

(* State3 [_transition(2)] *)
State3 ==
  outbox_timed_outbox_deadByExhaustion = FALSE
    /\ outbox_timed_outbox_dests
      = SetAsFun({ <<"d1", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>>,
        <<"d2", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>> })
    /\ outbox_timed_outbox_expected = { <<"e2", "d1">>, <<"e2", "d2">> }
    /\ outbox_timed_outbox_ingested = {"e2"}
    /\ outbox_timed_outbox_nextToken = 2
    /\ outbox_timed_outbox_replays = 0
    /\ outbox_timed_outbox_rows
      = SetAsFun({ <<
          <<"e1", "d1">>, [attempts |-> 0, status |-> "none", token |-> 0]
        >>,
        <<<<"e1", "d2">>, [attempts |-> 0, status |-> "none", token |-> 0]>>,
        <<<<"e2", "d1">>, [attempts |-> 0, status |-> "pending", token |-> 0]>>,
        <<
          <<"e2", "d2">>, [attempts |-> 0, status |-> "in_flight", token |-> 1]
        >> })
    /\ outbox_timed_outbox_sends
      = SetAsFun({ <<<<"e1", "d1">>, 0>>,
        <<<<"e1", "d2">>, 0>>,
        <<<<"e2", "d1">>, 0>>,
        <<<<"e2", "d2">>, 1>> })
    /\ outbox_timed_outbox_sentAfterTerminal = FALSE
    /\ outbox_timed_outbox_strandedInFlight = FALSE
    /\ outbox_timed_outbox_workers
      = SetAsFun({ <<
          "w1", [claimedAttempts |-> 0,
            key |-> <<"e2", "d2">>,
            phase |-> "sent",
            result |-> "permanent",
            token |-> 1]
        >>,
        <<
          "w2", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >> })

(* State4 [_transition(5)] *)
State4 ==
  outbox_timed_outbox_deadByExhaustion = FALSE
    /\ outbox_timed_outbox_dests
      = SetAsFun({ <<"d1", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>>,
        <<"d2", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>> })
    /\ outbox_timed_outbox_expected = { <<"e2", "d1">>, <<"e2", "d2">> }
    /\ outbox_timed_outbox_ingested = {"e2"}
    /\ outbox_timed_outbox_nextToken = 2
    /\ outbox_timed_outbox_replays = 0
    /\ outbox_timed_outbox_rows
      = SetAsFun({ <<
          <<"e1", "d1">>, [attempts |-> 0, status |-> "none", token |-> 0]
        >>,
        <<<<"e1", "d2">>, [attempts |-> 0, status |-> "none", token |-> 0]>>,
        <<<<"e2", "d1">>, [attempts |-> 0, status |-> "pending", token |-> 0]>>,
        <<
          <<"e2", "d2">>, [attempts |-> 0, status |-> "in_flight", token |-> 1]
        >> })
    /\ outbox_timed_outbox_sends
      = SetAsFun({ <<<<"e1", "d1">>, 0>>,
        <<<<"e1", "d2">>, 0>>,
        <<<<"e2", "d1">>, 0>>,
        <<<<"e2", "d2">>, 1>> })
    /\ outbox_timed_outbox_sentAfterTerminal = FALSE
    /\ outbox_timed_outbox_strandedInFlight = FALSE
    /\ outbox_timed_outbox_workers
      = SetAsFun({ <<
          "w1", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >>,
        <<
          "w2", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >> })

(* State5 [_transition(1)] *)
State5 ==
  outbox_timed_outbox_deadByExhaustion = FALSE
    /\ outbox_timed_outbox_dests
      = SetAsFun({ <<"d1", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>>,
        <<"d2", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>> })
    /\ outbox_timed_outbox_expected = { <<"e2", "d1">>, <<"e2", "d2">> }
    /\ outbox_timed_outbox_ingested = {"e2"}
    /\ outbox_timed_outbox_nextToken = 3
    /\ outbox_timed_outbox_replays = 0
    /\ outbox_timed_outbox_rows
      = SetAsFun({ <<
          <<"e1", "d1">>, [attempts |-> 0, status |-> "none", token |-> 0]
        >>,
        <<<<"e1", "d2">>, [attempts |-> 0, status |-> "none", token |-> 0]>>,
        <<<<"e2", "d1">>, [attempts |-> 0, status |-> "pending", token |-> 0]>>,
        <<
          <<"e2", "d2">>, [attempts |-> 0, status |-> "in_flight", token |-> 2]
        >> })
    /\ outbox_timed_outbox_sends
      = SetAsFun({ <<<<"e1", "d1">>, 0>>,
        <<<<"e1", "d2">>, 0>>,
        <<<<"e2", "d1">>, 0>>,
        <<<<"e2", "d2">>, 1>> })
    /\ outbox_timed_outbox_sentAfterTerminal = FALSE
    /\ outbox_timed_outbox_strandedInFlight = FALSE
    /\ outbox_timed_outbox_workers
      = SetAsFun({ <<
          "w1", [claimedAttempts |-> 0,
            key |-> <<"e2", "d2">>,
            phase |-> "claimed",
            result |-> "",
            token |-> 2]
        >>,
        <<
          "w2", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >> })

(* State6 [_transition(2)] *)
State6 ==
  outbox_timed_outbox_deadByExhaustion = FALSE
    /\ outbox_timed_outbox_dests
      = SetAsFun({ <<"d1", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>>,
        <<"d2", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>> })
    /\ outbox_timed_outbox_expected = { <<"e2", "d1">>, <<"e2", "d2">> }
    /\ outbox_timed_outbox_ingested = {"e2"}
    /\ outbox_timed_outbox_nextToken = 3
    /\ outbox_timed_outbox_replays = 0
    /\ outbox_timed_outbox_rows
      = SetAsFun({ <<
          <<"e1", "d1">>, [attempts |-> 0, status |-> "none", token |-> 0]
        >>,
        <<<<"e1", "d2">>, [attempts |-> 0, status |-> "none", token |-> 0]>>,
        <<<<"e2", "d1">>, [attempts |-> 0, status |-> "pending", token |-> 0]>>,
        <<
          <<"e2", "d2">>, [attempts |-> 0, status |-> "in_flight", token |-> 2]
        >> })
    /\ outbox_timed_outbox_sends
      = SetAsFun({ <<<<"e1", "d1">>, 0>>,
        <<<<"e1", "d2">>, 0>>,
        <<<<"e2", "d1">>, 0>>,
        <<<<"e2", "d2">>, 2>> })
    /\ outbox_timed_outbox_sentAfterTerminal = FALSE
    /\ outbox_timed_outbox_strandedInFlight = FALSE
    /\ outbox_timed_outbox_workers
      = SetAsFun({ <<
          "w1", [claimedAttempts |-> 0,
            key |-> <<"e2", "d2">>,
            phase |-> "sent",
            result |-> "permanent",
            token |-> 2]
        >>,
        <<
          "w2", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >> })

(* State7 [_transition(5)] *)
State7 ==
  outbox_timed_outbox_deadByExhaustion = FALSE
    /\ outbox_timed_outbox_dests
      = SetAsFun({ <<"d1", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>>,
        <<"d2", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>> })
    /\ outbox_timed_outbox_expected = { <<"e2", "d1">>, <<"e2", "d2">> }
    /\ outbox_timed_outbox_ingested = {"e2"}
    /\ outbox_timed_outbox_nextToken = 3
    /\ outbox_timed_outbox_replays = 0
    /\ outbox_timed_outbox_rows
      = SetAsFun({ <<
          <<"e1", "d1">>, [attempts |-> 0, status |-> "none", token |-> 0]
        >>,
        <<<<"e1", "d2">>, [attempts |-> 0, status |-> "none", token |-> 0]>>,
        <<<<"e2", "d1">>, [attempts |-> 0, status |-> "pending", token |-> 0]>>,
        <<
          <<"e2", "d2">>, [attempts |-> 0, status |-> "in_flight", token |-> 2]
        >> })
    /\ outbox_timed_outbox_sends
      = SetAsFun({ <<<<"e1", "d1">>, 0>>,
        <<<<"e1", "d2">>, 0>>,
        <<<<"e2", "d1">>, 0>>,
        <<<<"e2", "d2">>, 2>> })
    /\ outbox_timed_outbox_sentAfterTerminal = FALSE
    /\ outbox_timed_outbox_strandedInFlight = FALSE
    /\ outbox_timed_outbox_workers
      = SetAsFun({ <<
          "w1", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >>,
        <<
          "w2", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >> })

(* State8 [_transition(1)] *)
State8 ==
  outbox_timed_outbox_deadByExhaustion = FALSE
    /\ outbox_timed_outbox_dests
      = SetAsFun({ <<"d1", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>>,
        <<"d2", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>> })
    /\ outbox_timed_outbox_expected = { <<"e2", "d1">>, <<"e2", "d2">> }
    /\ outbox_timed_outbox_ingested = {"e2"}
    /\ outbox_timed_outbox_nextToken = 4
    /\ outbox_timed_outbox_replays = 0
    /\ outbox_timed_outbox_rows
      = SetAsFun({ <<
          <<"e1", "d1">>, [attempts |-> 0, status |-> "none", token |-> 0]
        >>,
        <<<<"e1", "d2">>, [attempts |-> 0, status |-> "none", token |-> 0]>>,
        <<<<"e2", "d1">>, [attempts |-> 0, status |-> "pending", token |-> 0]>>,
        <<
          <<"e2", "d2">>, [attempts |-> 0, status |-> "in_flight", token |-> 3]
        >> })
    /\ outbox_timed_outbox_sends
      = SetAsFun({ <<<<"e1", "d1">>, 0>>,
        <<<<"e1", "d2">>, 0>>,
        <<<<"e2", "d1">>, 0>>,
        <<<<"e2", "d2">>, 2>> })
    /\ outbox_timed_outbox_sentAfterTerminal = FALSE
    /\ outbox_timed_outbox_strandedInFlight = FALSE
    /\ outbox_timed_outbox_workers
      = SetAsFun({ <<
          "w1", [claimedAttempts |-> 0,
            key |-> <<"e2", "d2">>,
            phase |-> "claimed",
            result |-> "",
            token |-> 3]
        >>,
        <<
          "w2", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >> })

(* State9 [_transition(2)] *)
State9 ==
  outbox_timed_outbox_deadByExhaustion = FALSE
    /\ outbox_timed_outbox_dests
      = SetAsFun({ <<"d1", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>>,
        <<"d2", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>> })
    /\ outbox_timed_outbox_expected = { <<"e2", "d1">>, <<"e2", "d2">> }
    /\ outbox_timed_outbox_ingested = {"e2"}
    /\ outbox_timed_outbox_nextToken = 4
    /\ outbox_timed_outbox_replays = 0
    /\ outbox_timed_outbox_rows
      = SetAsFun({ <<
          <<"e1", "d1">>, [attempts |-> 0, status |-> "none", token |-> 0]
        >>,
        <<<<"e1", "d2">>, [attempts |-> 0, status |-> "none", token |-> 0]>>,
        <<<<"e2", "d1">>, [attempts |-> 0, status |-> "pending", token |-> 0]>>,
        <<
          <<"e2", "d2">>, [attempts |-> 0, status |-> "in_flight", token |-> 3]
        >> })
    /\ outbox_timed_outbox_sends
      = SetAsFun({ <<<<"e1", "d1">>, 0>>,
        <<<<"e1", "d2">>, 0>>,
        <<<<"e2", "d1">>, 0>>,
        <<<<"e2", "d2">>, 3>> })
    /\ outbox_timed_outbox_sentAfterTerminal = FALSE
    /\ outbox_timed_outbox_strandedInFlight = FALSE
    /\ outbox_timed_outbox_workers
      = SetAsFun({ <<
          "w1", [claimedAttempts |-> 0,
            key |-> <<"e2", "d2">>,
            phase |-> "sent",
            result |-> "permanent",
            token |-> 3]
        >>,
        <<
          "w2", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >> })

(* State10 [_transition(5)] *)
State10 ==
  outbox_timed_outbox_deadByExhaustion = FALSE
    /\ outbox_timed_outbox_dests
      = SetAsFun({ <<"d1", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>>,
        <<"d2", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>> })
    /\ outbox_timed_outbox_expected = { <<"e2", "d1">>, <<"e2", "d2">> }
    /\ outbox_timed_outbox_ingested = {"e2"}
    /\ outbox_timed_outbox_nextToken = 4
    /\ outbox_timed_outbox_replays = 0
    /\ outbox_timed_outbox_rows
      = SetAsFun({ <<
          <<"e1", "d1">>, [attempts |-> 0, status |-> "none", token |-> 0]
        >>,
        <<<<"e1", "d2">>, [attempts |-> 0, status |-> "none", token |-> 0]>>,
        <<<<"e2", "d1">>, [attempts |-> 0, status |-> "pending", token |-> 0]>>,
        <<
          <<"e2", "d2">>, [attempts |-> 0, status |-> "in_flight", token |-> 3]
        >> })
    /\ outbox_timed_outbox_sends
      = SetAsFun({ <<<<"e1", "d1">>, 0>>,
        <<<<"e1", "d2">>, 0>>,
        <<<<"e2", "d1">>, 0>>,
        <<<<"e2", "d2">>, 3>> })
    /\ outbox_timed_outbox_sentAfterTerminal = FALSE
    /\ outbox_timed_outbox_strandedInFlight = FALSE
    /\ outbox_timed_outbox_workers
      = SetAsFun({ <<
          "w1", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >>,
        <<
          "w2", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >> })

(* State11 [_transition(1)] *)
State11 ==
  outbox_timed_outbox_deadByExhaustion = FALSE
    /\ outbox_timed_outbox_dests
      = SetAsFun({ <<"d1", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>>,
        <<"d2", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>> })
    /\ outbox_timed_outbox_expected = { <<"e2", "d1">>, <<"e2", "d2">> }
    /\ outbox_timed_outbox_ingested = {"e2"}
    /\ outbox_timed_outbox_nextToken = 5
    /\ outbox_timed_outbox_replays = 0
    /\ outbox_timed_outbox_rows
      = SetAsFun({ <<
          <<"e1", "d1">>, [attempts |-> 0, status |-> "none", token |-> 0]
        >>,
        <<<<"e1", "d2">>, [attempts |-> 0, status |-> "none", token |-> 0]>>,
        <<<<"e2", "d1">>, [attempts |-> 0, status |-> "pending", token |-> 0]>>,
        <<
          <<"e2", "d2">>, [attempts |-> 0, status |-> "in_flight", token |-> 4]
        >> })
    /\ outbox_timed_outbox_sends
      = SetAsFun({ <<<<"e1", "d1">>, 0>>,
        <<<<"e1", "d2">>, 0>>,
        <<<<"e2", "d1">>, 0>>,
        <<<<"e2", "d2">>, 3>> })
    /\ outbox_timed_outbox_sentAfterTerminal = FALSE
    /\ outbox_timed_outbox_strandedInFlight = FALSE
    /\ outbox_timed_outbox_workers
      = SetAsFun({ <<
          "w1", [claimedAttempts |-> 0,
            key |-> <<"e2", "d2">>,
            phase |-> "claimed",
            result |-> "",
            token |-> 4]
        >>,
        <<
          "w2", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >> })

(* State12 [_transition(2)] *)
State12 ==
  outbox_timed_outbox_deadByExhaustion = FALSE
    /\ outbox_timed_outbox_dests
      = SetAsFun({ <<"d1", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>>,
        <<"d2", [deleted |-> FALSE, enabled |-> TRUE, up |-> TRUE]>> })
    /\ outbox_timed_outbox_expected = { <<"e2", "d1">>, <<"e2", "d2">> }
    /\ outbox_timed_outbox_ingested = {"e2"}
    /\ outbox_timed_outbox_nextToken = 5
    /\ outbox_timed_outbox_replays = 0
    /\ outbox_timed_outbox_rows
      = SetAsFun({ <<
          <<"e1", "d1">>, [attempts |-> 0, status |-> "none", token |-> 0]
        >>,
        <<<<"e1", "d2">>, [attempts |-> 0, status |-> "none", token |-> 0]>>,
        <<<<"e2", "d1">>, [attempts |-> 0, status |-> "pending", token |-> 0]>>,
        <<
          <<"e2", "d2">>, [attempts |-> 0, status |-> "in_flight", token |-> 4]
        >> })
    /\ outbox_timed_outbox_sends
      = SetAsFun({ <<<<"e1", "d1">>, 0>>,
        <<<<"e1", "d2">>, 0>>,
        <<<<"e2", "d1">>, 0>>,
        <<<<"e2", "d2">>, 4>> })
    /\ outbox_timed_outbox_sentAfterTerminal = FALSE
    /\ outbox_timed_outbox_strandedInFlight = FALSE
    /\ outbox_timed_outbox_workers
      = SetAsFun({ <<
          "w1", [claimedAttempts |-> 0,
            key |-> <<"e2", "d2">>,
            phase |-> "sent",
            result |-> "permanent",
            token |-> 4]
        >>,
        <<
          "w2", [claimedAttempts |-> 0,
            key |-> <<"e1", "d1">>,
            phase |-> "idle",
            result |-> "",
            token |-> 0]
        >> })

(* The following formula holds true in the last state and violates the invariant *)
InvariantViolation ==
  Skolem((\E t_u_1 \in { "d1", "d2" }:
    Skolem((\E t_t_1 \in { "e1", "e2" }:
      outbox_timed_outbox_sends[<<t_t_1, t_u_1>>] > 3))))

================================================================================
(* Created by Apalache on Tue Sep 29 19:34:42 CST 2026 *)
(* https://github.com/apalache-mc/apalache *)
