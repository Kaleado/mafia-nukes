const Express = require('express');
const BodyParser = require('body-parser');

const app = Express();
app.use(BodyParser.json());

var maxId = -1;
var maxCardId = -1;

function Card(name, id, internal_name){
    this.name = name;
    this.id = id;
    this.internal_name = internal_name;
}

function Player(name, id, role, ip, alive){
    this.name = name;
    this.id = id;
    this.role = role;
    this.ip = ip;
    this.alive = alive;
}

function shuffleArray(arr){
    var m = arr.length, t, i;
    while(m){
        i = Math.floor(Math.random()*m--);
        t = arr[m];
        arr[m] = arr[i];
        arr[i] = t;
    }
    return arr;
}

function deepCopy(obj){
    return JSON.parse(JSON.stringify(obj));
}

// The global game state.
var gameState = {
    _state: {
        turnStatus: "status_lobby",
        turnNumber: 0,
        players: {},
        playerHands: {},
        structures: {},
        log: [],
        resourceDeck: [],
        minorDisasterDeck: [],
        majorDisasterDeck: [],
        eventDeck: [],
        nukeStacks: {},
        buildStacks: {},
        revealedEvent: undefined,
        revealedDisaster: undefined,
        votes: {}
    },
    // A list of codes to ensure that each player only joins once.
    _playerCodes: [
        'a',
        'b',
        'c',
        'd'
    ],
    _lobbySize: 0,// The number of players to accept before starting.
    _serverStatus: "starting_up",// The server state.
    //The roles to be used in this game.
    _roles: [
        "Hoarder",
        "Superpower",
        "Superpower",
        "Martyr",
        "Doomsayer",
        "Futurist"
    ],
    _allocateRole: function(){
        //Allocate the Superpower if one of the Superpowers has already been
        //chosen. I realise this is not the best way to do it.
        for(var p in Object.keys(this._state.players)){
            if(this._state.players.role == "Superpower" &&
               this._roles.indexOf("Superpower") != -1){
                this._roles.splice(this._roles.indexOf("Superpower"), 1);
                return "Superpower";
            }
        }
        var n = Math.floor(Math.random() * this._roles.length);
        return this._roles[n];
    },
    getServerStatus: function(){
        return this._serverStatus;
    },
    getSubjectiveState: function(playerId){
        // Gets a subjective view of the game board (so that you can't see other
        // people's cards, etc).
        var cleanedState = deepCopy(this._state);//This deep-copies _state.
        for(var i in Object.keys(cleanedState.players)){
            if(i == playerId){continue;}
            for(var j = 0; j < cleanedState.playerHands[i].length; ++j){
                cleanedState.playerHands[i][j]["name"] = "Unknown";
                cleanedState.playerHands[i][j]["internal_name"] = "unknown";
            }
            cleanedState.playerHands[i].role = "Unknown";
        }
        cleanedState.minorDisasterDeckSize = cleanedState.minorDisasterDeck.length;
        cleanedState.minorDisasterDeck = undefined;
        cleanedState.majorDisasterDeckSize = cleanedState.majorDisasterDeck.length;
        cleanedState.majorDisasterDeck = undefined;
        cleanedState.eventDeckSize = cleanedState.eventDeck.length;
        cleanedState.eventDeck = undefined;
        cleanedState.resourceDeckSize = cleanedState.resourceDeck.length;
        cleanedState.resourceDeck = undefined;
        return cleanedState;
    },
    ipToPlayerId: function(ip){
        for(var i in this._state.players.keys){
            if(this._state.players[i].ip == ip){
                return this._state.players[i];
            }
        }
        return undefined;
    },
    addPlayer: function(player){
        this._state.players[player.id]     = player;
        this._state.playerHands[player.id] = [];
        this._state.structures[player.id]  = [];
        if(Object.keys(this._state.players).length == this._lobbySize){
            //Start the game.
            this.startGame();
        }
    },
    openLobby: function(nPlayers){
        this._lobbySize = nPlayers;
        this._serverStatus = "waiting_for_players";
    },
    consumePlayerCode: function(code){
        var idx = this._playerCodes.indexOf(code);
        if(idx != -1){
            this._playerCodes.splice(idx, 1);
            return true;
        }
        return false;
    },
    _setUpResourceDeck: function(){
        //50 copies of concrete and steel.
        for(let x = 0; x < 50; ++x){
            this._state.resourceDeck.push(new Card("Concrete", generateCardId(), "concrete"));
            this._state.resourceDeck.push(new Card("Steel", generateCardId(), "steel"));
        }
        //8 copies of uranium.
        for(let x = 0; x < 8; ++x){
            this._state.resourceDeck.push(new Card("Uranium", generateCardId(), "uranium"));
        }
        //2 copies of black market nuke.
        for(let x = 0; x < 2; ++x){
            this._state.resourceDeck.push(new Card("Black Market Nuclear Warhead",
                                                   generateCardId(), "nuke"));
        }
        shuffleArray(this._state.resourceDeck);
    },
    _setUpEventDeck: function(){
        if(Object.keys(this._state.players).length <= 4){
            //Add copies of deep-sea exploration.
            for(let x = 0; x < 6; ++x){
                this._state.eventDeck.push(
                    new Card("Deep-sea Exploration", generateCardId(), "deep_sea_exploration")
                );
            }
        }
        for(let x = 0; x < 2; ++x){
            this._state.eventDeck.push(
                new Card("Foreign Aid", generateCardId(), "foreign_aid")
            );
            this._state.eventDeck.push(
                new Card("International Grant", generateCardId(), "international_grant")
            );
            this._state.eventDeck.push(
                new Card("Conservation Effort", generateCardId(), "conservation_effort")
            );
            this._state.eventDeck.push(
                new Card("Militarisation", generateCardId(), "militarisation")
            );
            this._state.eventDeck.push(
                new Card("International Investigation", generateCardId(), "international_investigation")
            );
        }
        this._state.eventDeck.push(
            new Card("Early Warning System", generateCardId(), "early_warning_system")
        );
        shuffleArray(this._state.eventDeck);
    },
    _setUpMinorDisasterDeck: function(){
        this._state.minorDisasterDeck.push(
            new Card("Tectonic Shift", generateCardId(), "tectonic_shift")
        );
        this._state.minorDisasterDeck.push(
            new Card("Drought", generateCardId(), "drought")
        );
        this._state.minorDisasterDeck.push(
            new Card("Territorial Dispute", generateCardId(), "land_dispute")
        );
        this._state.minorDisasterDeck.push(
            new Card("Political Instability", generateCardId(), "regional_instability")
        );
        shuffleArray(this._state.minorDisasterDeck);
    },
    _setUpMajorDisasterDeck: function(){
        this._state.majorDisasterDeck.push(
            new Card("Super Typhoon", generateCardId(), "hypercane")
        );
        this._state.majorDisasterDeck.push(
            new Card("Asteroid Strike", generateCardId(), "meteor")
        );
        this._state.majorDisasterDeck.push(
            new Card("Hostage Situation", generateCardId(), "hostage_situation")
        );
        shuffleArray(this._state.majorDisasterDeck);
    },
    startGame: function(){
        //Assign everyone their roles.
        for(let player in Object.keys(this._state.players)){
            this._state.players[player].role = this._allocateRole();
        }
        //Set up all three decks.
        this._setUpResourceDeck();
        this._setUpMinorDisasterDeck();
        this._setUpMajorDisasterDeck();
        this._setUpEventDeck();
        //Everyone draws their 5 resource cards.
        for(let player in Object.keys(this._state.players)){
            this._state.playerHands[player] = this._state.resourceDeck.splice(-5);
        }
        //Begin with the draw phase.
        this.drawPhase();
    },
    _getStructureCount: function(internalName, playerId){
        let total = 0;
        for(let c in this._state.structures[playerId]){
            let card = this._state.structures[playerId][c];
            if(card["internal_name"] == internalName){
                total += 1;
            }
        }
        return total;
    },
    drawCards: function(numCards, playerId){
        let cardsToDraw = numCards;
        if(this._state.resourceDeck.length <= cardsToDraw){
            cardsToDraw = this._state.resourceDeck.length;
        }
        this._state.playerHands[playerId] = this._state.resourceDeck.splice(-cardsToDraw);
    },
    log: function(msg){
        this._state.log.push(msg);
    },
    drawPhase: function(){
        //Each player draws a card.
        for(let player in Object.keys(this._state.players)){
            let numDrills = this._getStructureCount("drill", player);
            this.drawCards(numDrills + 1);
        }
        this.eventRevealPhase();
    },
    submitVoteForPlayer(voterId, playerId){
        //Return true if the vote is valid, false otherwise.
        if(this._state.vote[playerId] != undefined){
            return false;
        }
        if(Object.keys(this._state.players).indexOf(voterId) != -1){
            return false;
        }
        this._state.vote[voterId] = playerId;
        //TODO: re-vote if no majority, otherwise enact effects,
        return true;
    },
    submitVoteYesNo(voterId, vote){
        //Return true if the vote is valid, false otherwise.
        if(Object.keys(this._state.players).indexOf(voterId) != -1){
            return false;
        }
        this._state.vote[voterId] = vote;
        //TODO: re-vote if no majority, otherwise enact effects,
        return true;
    },
    eventRevealPhase: function(){
        //Get the top card from the event deck and reveal it.
        if(this._state.revealedEvent == undefined){
            this._state.revealedEvent = this._state.eventDeck.splice(-1);
        }
        this.eventResolutionPhase();
    },
    eventResolutionPhase: function(){
        //We assume there will always be an event revealed.
        switch(this._state.revealedEvent["internal_name"]){
        case "foreign_aid":
            this._state.turnStatus = "status_give_card_foreign_aid";
            break;
        case "international_grant":
            this._state.turnStatus = "status_voting_player";
            break;
        case "conservation_effort":
            this._state.turnStatus = "status_voting_yes_no";
            break;
        case "deep_sea_exploration":
            this.log("Everyone draws a card due to deep-sea discoveries.");
            for(let player in Object.keys(this._state.players)){
                this.drawCards(1, player);
            }
            break;
        case "militarisation":
            this._state.turnStatus = "status_voting_player";
            break;
        case "international_investigation":
            this._state.turnStatus = "status_voting_player";
            break;
        case "early_warning_system":
            this._state.turnStatus = "status_voting_yes_no";
            break;
        }
    }
};

function generatePlayerId(){
    //Not a great way of doing it but that's okay!
    maxId += 1;
    return maxId;
}

function generateCardId(){
    //Not a great way of doing it but that's okay!
    maxCardId += 1;
    return maxCardId;
}

/************************** ROUTES *****************************/

app.get("/get_state", (req, res) => {
    var id = gameState.ipToPlayerId(req.connection.remoteAddress);
    console.log(id);
    res.send(gameState.getSubjectiveState(id));
});

app.post("/join", (req, res) => {
    if(gameState.getServerStatus() != "waiting_for_players"){
        res.send({
            msg: "Lobby not open."
        });
        return;
    }
    var code = req.body["code"];
    var playerName = req.body["player_name"];
    if(gameState.consumePlayerCode(code)){
        var newPlayer = new Player(playerName,
                                   generatePlayerId(),
                                   "no_role",
                                   req.connection.remoteAddress,
                                   true);
        gameState.addPlayer(newPlayer);
        res.send(gameState.getSubjectiveState(newPlayer.id));
    }
    else {
        res.send({
            msg: "Invalid player code."
        });
    }
});

app.post("/vote_for_player", (req, res) => {
    if(gameState.getServerStatus() != ""){
        res.send(gameState.getSubjectiveState(newPlayer.id));
        return;
    }
    var voteFor = req.body["vote_for"];
    var id = gameState.ipToPlayerId(req.connection.remoteAddress);
    gameState.submitVoteForPlayer(id, voteFor);
    res.send(gameState.getSubjectiveState(newPlayer.id));
});

gameState.openLobby(2);

app.listen(3000, () => {
    console.log("Listening on port 3000.");
});
