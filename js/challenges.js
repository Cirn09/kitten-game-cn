dojo.declare("classes.managers.ChallengesManager", com.nuclearunicorn.core.TabManager, {

	constructor: function(game){
		this.game = game;
		this.registerMeta("stackable", this.challenges, null);
		this.setEffectsCachedExisting();
	},

	currentChallenge: null,

    challenges:[
    {
		name: "ironWill",
		label: $I("challendge.ironWill.label"),
		description: $I("challendge.ironWill.desc"),
		effectDesc: $I("challendge.ironWill.effect.desc"),
        researched: false,
        unlocked: true
	},{
		name: "winterIsComing",
		label: $I("challendge.winterIsComing.label"),
		description: $I("challendge.winterIsComing.desc"),
		effectDesc: $I("challendge.winterIsComing.effect.desc"),
		researched: false,
		unlocked: true,
		effects: {
			"springCatnipRatio": 0.05,
			"summerSolarFarmRatio": 0.05
		},
		calculateEffects: function(self, game){
			if (self.active) {
				self.effects["springCatnipBonus"] = 0;
                                self.effects["summerSolarFarmBonus"] = 0;
			}
		},
		checkCompletionCondition: function(game){
			return game.space.getPlanet("helios").reached;
		}
	},{
		name: "anarchy",
		label: $I("challendge.anarchy.label"),
		description: $I("challendge.anarchy.desc"),
		effectDesc: $I("challendge.anarchy.effect.desc"),
		researched: false,
		unlocked: true,
                effects: {
                        "masterSkillMultiplier": 0.2
                },
                calculateEffects: function(self, game){
                        if (self.active) {
                                self.effects["masterSkillMultiplier"] = 0;
                        }
                },
		checkCompletionCondition: function(game){
			return game.bld.get("aiCore").val > 0;
		}
	},{
		name: "energy",
		label: $I("challendge.energy.label"),
		description: $I("challendge.energy.desc"),
		effectDesc: $I("challendge.energy.effect.desc"),
        researched: false,
		unlocked: false,
		upgrades: {
			buildings: ["library", "biolab", "calciner", "oilWell", "factory", "accelerator", "chronosphere", "aiCore"],
			spaceBuilding: ["sattelite", "spaceStation", "moonOutpost", "moonBase", "orbitalArray", "containmentChamber"],
			voidSpace: ["chronocontrol"]
		},
		effects: {
			"energyConsumptionRatio": -0.02
		},
		calculateEffects: function(self, game){
			if (self.active) {
				self.effects["energyConsumptionRatio"] = 0;
			}
		},
		checkCompletionCondition: function(game){
			return(
				(game.bld.get("pasture").val > 0 && game.bld.get("pasture").stage == 1) &&
				(game.bld.get("aqueduct").val > 0 && game.bld.get("aqueduct").stage == 1) &&
				game.bld.get("steamworks").val > 0 &&
				game.bld.get("magneto").val > 0 &&
				game.bld.get("reactor").val > 0 &&
				(game.space.getBuilding("sattelite").val > 0 && game.workshop.get("solarSatellites").researched) &&
				game.space.getBuilding("sunlifter").val > 0 &&
				game.space.getBuilding("tectonic").val > 0 &&
				game.space.getBuilding("hrHarvester").val > 0
				);
		}
	},{
		name: "atheism",
		label: $I("challendge.atheism.label"),
		description: $I("challendge.atheism.desc"),
		effectDesc: $I("challendge.atheism.effect.desc"),
		effects: {
			"faithSolarRevolutionBoost": 0.1
		},
		calculateEffects: function(self, game) {
                        if (self.active) {
                                self.effects["faithSolarRevolutionBoost"] = 0;
                        }
		},
        researched: false,
        unlocked: false
	},{
		name: "1000Years",
		label: $I("challendge.1000Years.label"),
		description: $I("challendge.1000Years.desc"),
		effectDesc: $I("challendge.1000Years.effect.desc"),
                effects: {
                        "shatterCostReduction": -0.02
                },
                calculateEffects: function(self, game){
                        if (self.active) {
                                self.effects["shatterCostReduction"] = 0;
                        }
                },
		researched: false,
		unlocked: false
	},{
		name: "blackSky",
		label: $I("challendge.blackSky.label"),
		description: $I("challendge.blackSky.desc"),
		effectDesc: $I("challendge.blackSky.effect.desc"),
		researched: false,
		unlocked: false,
                effects: {
                        "corruptionBoostRatioChallenge": 0.1
                },
                calculateEffects: function(self, game){
                        if (self.active) {
                                self.effects["corruptionBoostRatioChallenge"] = 0;
                        }
                },
		checkCompletionCondition: function(game){
			return game.space.getBuilding("spaceBeacon").val > 0;
		}
	}],

	game: null,

	resetState: function(){
		for (var i = 0; i < this.challenges.length; i++){
			var challenge = this.challenges[i];
			challenge.enabled = false;
			challenge.pending = false;
			challenge.active = false;
			this.resetStateStackable(challenge);
		}
		this.currentChallenge = null;
	},

	save: function(saveData){
		saveData.challenges = {
			challenges: this.filterMetadata(this.challenges, [
				"name", 
				"researched", 	//deprecated
				"on", 
				"unlocked", 
				"active"		//if currently active or not
			])
		};
	},

	load: function(saveData){
		if (!saveData.challenges){
			return;
		}

		this.loadMetadata(this.challenges, saveData.challenges.challenges);

		//legacy saves compatibility mode
		var currentChallenge = saveData.challenges.currentChallenge;
		if (currentChallenge){
			this.getChallenge(currentChallenge).active = true;
		}

		for (var i = 0; i < this.challenges.length; i++) {
			if (this.challenges[i].researched && !this.challenges[i].on) {
				this.challenges[i].on = 1;
			}
		}
	},

	update: function(){
		// energy
		if (this.getChallenge("energy").unlocked == false) {
			if (this.game.resPool.energyProd != 0 || this.game.resPool.energyCons != 0) {
				this.getChallenge("energy").unlocked = true;
			}
		} 
		//checkCompletionCondition for functions tested for completion here
		for(var i = 0; i< this.challenges.length; i++){
			if(this.challenges[i].active && this.challenges[i].checkCompletionCondition && this.challenges[i].checkCompletionCondition(this.game)){
				this.researchChallenge(this.challenges[i].name);
			}
		}
	},

	getChallenge: function(name){
		return this.getMeta(name, this.challenges);
	},

	/*
		returns true if challenge currently in progress
	*/
	isActive: function(name){
		return !!this.getChallenge(name).active;
	},

	researchChallenge: function(challenge) {
		if (this.isActive(challenge)){
			this.getChallenge(challenge).researched = true;
			this.getChallenge(challenge).on += 1;
			this.getChallenge(challenge).active = false;
			this.game.msg($I("challendge.btn.log.message.on.complete", [this.getChallenge(challenge).label]));
			if(this.getChallenge(challenge).actionOnCompletion){
				this.getChallenge(challenge).actionOnCompletion(this.game);
			}
			this.game.calculateAllEffects();
		}
	},

	/**
	 * Apply challenges marked by player as pending
	 */
	applyPending: function(){
		var game = this.game;
		game.ui.confirm(
			$I("challendge.btn.confirmation.title"), 
			$I("challendge.btn.confirmation.msg"), function() 
		{
			// Reset with any benefit of chronosphere (resources, kittens, etc...)

			game.bld.get("chronosphere").val = 0;
			game.bld.get("chronosphere").on = 0;
			game.time.getVSU("cryochambers").val = 0;
			game.time.getVSU("cryochambers").on = 0;

			game.resetAutomatic();
		}, function() {
		});
	},

	//TODO: rewrite using the general getEffect logic

	/*getChallengeEffect: function(name, type) {
		var challenge = this.getChallenge(name);
		if (name == "energy") {
			return 2 + 0.1 * challenge.val;
		}
	},*/

});

dojo.declare("classes.ui.ChallengeBtnController", com.nuclearunicorn.game.ui.BuildingBtnController, {

	getMetadata: function(model){
        if (!model.metaCached){
            model.metaCached = this.game.challenges.getChallenge(model.options.id);
        }
        return model.metaCached;
    },

    getDescription: function(model) {
		if (this.game.bld.get("chronosphere").val > 0) {
			var msgChronosphere = model.metadata.name == "ironWill" ? $I("challendge.btn.chronosphere.with.ironWill.desc") : $I("challendge.btn.chronosphere.desc");
		} else {
			var msgChronosphere = "";
		}
		return this.inherited(arguments) + $I("challendge.btn.desc", [model.metadata.effectDesc, msgChronosphere]) ;
	},

	getName: function(model){

		var meta = model.metadata;
		var name = meta.label;
		if (meta.active || meta.name == this.game.challenges.active) {
			name = $I("challendge.btn.name.current", [meta.label]);
		} else if (meta.researched){
			name = $I("challendge.btn.name.complete", [meta.label]);
		} 
		if (meta.pending){
			name += " (" + $I("challendge.pending") + ")";
		}
		if (meta.on) {
			name += " (" + meta.on + ")";
		}
		return name;
	},

	updateVisible: function(model){
		model.visible = model.metadata.unlocked;
	},

	getPrices: function(model) {
		return $.extend(true, [], model.metadata.prices); // Create a new array to keep original values
	},

	buyItem: function(model, event, callback) {
		/*if (model.metadata.name == this.game.challenges.currentChallenge
		 || (!model.enabled && !this.game.devMode)) {
			callback(false);
			return;
		}

		var game = this.game;
		game.ui.confirm($I("challendge.btn.confirmation.title"), $I("challendge.btn.confirmation.msg"), function() {
			// Set the challenge for after reset
			game.challenges.currentChallenge = model.metadata.name == "ironWill"
				? null
				: model.metadata.name;
			// Reset with any benefit of chronosphere (resources, kittens, etc...)
			game.bld.get("chronosphere").val = 0;
			game.bld.get("chronosphere").on = 0;
			game.time.getVSU("cryochambers").val = 0;
			game.time.getVSU("cryochambers").on = 0;
			game.resetAutomatic();
			callback(true);
		}, function() {
			callback(false);
		});*/

		this.togglePending(model);
	},

	togglePending: function(model){
		if (model.metadata.name == "ironWill") {
			return;
		}
		model.metadata.pending = !model.metadata.pending;
	},

	updateEnabled: function(model){
		this.inherited(arguments);
		if (model.metadata.researched){
			model.enabled = false;
		}
	}
});

dojo.declare("classes.ui.ChallengePanel", com.nuclearunicorn.game.ui.Panel, {

	game: null,

	constructor: function(){
	},

    render: function(container){
		var content = this.inherited(arguments);
		var self = this;
		var controller = new classes.ui.ChallengeBtnController(self.game);
		dojo.forEach(this.game.challenges.challenges, function(challenge, i){
			var button = new com.nuclearunicorn.game.ui.BuildingBtn({id: challenge.name, controller: controller}, self.game);
			button.render(content);
			self.addChild(button);
		});

	}

});

dojo.declare("classes.tab.ChallengesTab", com.nuclearunicorn.game.ui.tab, {
	render: function(container){
		this.challengesPanel = new classes.ui.ChallengePanel($I("challendge.panel.label"), this.game.challenges);
		this.challengesPanel.game = this.game;
		this.challengesPanel.render(container);

		//consition panel to be reviewed

		/*this.conditionsPanel = new classes.ui.ConditionPanel($I("challendge.condition.panel.label"), this.game.challenges);
		this.conditionsPanel.game = this.game;
		this.conditionsPanel.render(container);*/

		dojo.create("div", { style: {
				marginBottom: "15px"
		} }, container);

		var applyPendingBtn = new com.nuclearunicorn.game.ui.ButtonModern({
			name: $I("challendge.applyPending.label"),
			description: $I("challendge.applyPending.desc"),
			handler: dojo.hitch(this, function(){
				this.game.challenges.applyPending();
			}),
			controller: new com.nuclearunicorn.game.ui.ButtonController(this.game, {
				updateVisible: function (model) {
					model.visible = false;
					for (var i = 0; i < this.game.challenges.challenges.length; i++){
						if (this.game.challenges.challenges[i].pending){
							model.visible = true;
						}
					}
				}, 
				getName: function(){
					var numPending = 0;
					for (var i = 0; i < this.game.challenges.challenges.length; i++){
						if (this.game.challenges.challenges[i].pending){
							numPending++;
						}
					}
					return $I("challendge.applyPending.label", [numPending]);
				}
			})
		}, this.game);
		applyPendingBtn.render(container);
		this.applyPendingBtn = applyPendingBtn;
	},

	update: function(){
		this.challengesPanel.update();
		//this.conditionsPanel.update();
		this.applyPendingBtn.update();
	}
});
