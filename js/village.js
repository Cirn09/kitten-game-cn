dojo.declare("classes.managers.VillageManager", com.nuclearunicorn.core.TabManager, {

	kittens: 0,

	maxKittens: 0,

	kittensPerTickBase: 0.01,

	catnipPerKitten: -0.85,	/* amount of catnip per tick that kitten consumes */

	happiness: 1,	//percents of happiness modifier

	//jobs assigned to kittens
	jobs: [{
		name: "woodcutter",
		title: $I("village.job.woodcutter"),
		description: $I("village.job.woodcutter.desc"),

		modifiers:{
			"wood" : 0.018
		},
		value: 0,
		unlocked: true,
		defaultUnlocked: true,
        flavor: $I("village.woodcutter.flavor")
	},{
		name: "farmer",
		title: $I("village.job.farmer"),
		description: $I("village.job.farmer.desc"),

		modifiers:{
			"catnip" : 1
		},
		value: 0,
		unlocked: false
	},{
		name: "scholar",
		title: $I("village.job.scholar"),
		description: $I("village.job.scholar.desc"),

		modifiers:{},
		calculateEffects: function(self, game){
			var modifiers = {
				"science" : 0.035
			};

			if (game.workshop.get("astrophysicists").researched){
				modifiers["starchart"] = 0.0001;	//i'm not entirely sure if it is too little or too much
			}

			self.modifiers = modifiers;
		},
		value: 0,
		unlocked: false
	},{
		name: "hunter",
		title: $I("village.job.hunter"),
		description: $I("village.job.hunter.desc"),

		modifiers:{
			"manpower" : 0.06
		},
		value: 0,
		unlocked: false,
        flavor: $I("village.job.hunter.flavor")
	},{
		name: "miner",
		title: $I("village.job.miner"),
		description: $I("village.job.miner.desc"),

		modifiers:{
			"minerals" : 0.05
		},
		value: 0,
		unlocked: false,
        flavor: $I("village.job.miner.flavor")
	},{
		name: "priest",
		title: $I("village.job.priest"),
		description: $I("village.job.priest.desc"),

		modifiers:{
			"faith" : 0.0015
		},
		value: 0,
		unlocked: false,
		evaluateLocks: function(game){
			return !game.challenges.isActive("atheism");
		}
	},{
		name: "geologist",
		title: $I("village.job.geologist"),
		description: $I("village.job.geologist.desc"),

		modifiers:{},
		calculateEffects: function(self, game){
			var coal = 0.015;
			var gold = 0;

			if (game.workshop.get("miningDrill").researched){
				coal += 0.010;
				gold += 0.0005;
			}
			if (game.workshop.get("unobtainiumDrill").researched){
				coal += 0.015;
				gold += 0.0005;
			}
			if (game.workshop.get("geodesy").researched){
				coal += 0.0075;
				gold += 0.0008;
			} else {
				// Drills don't add gold before geodesy.
				gold = 0;
			}

			var modifiers = {
				"coal" : coal
			};
			if (gold > 0){
				modifiers["gold"] = gold;
			}

			self.modifiers = modifiers;
		},
		value: 0,
		unlocked: false
	},{
		name: "engineer",
		title: $I("village.job.engineer"),
		description: $I("village.job.engineer.desc"),
		modifiers:{
		},
		value: 0,
		unlocked: false
	}],
	jobNames: null,

	//resource modifiers per tick
	resourceModifiers: {
		"catnip" : 0
	},

	game: null,

	sim: null,
	map: null,
	deathTimeout: 0,

	leader: null,	//a reference to a leader kitten for fast access, must be restored on load,
	senators: null,

	traits: null,

	getRankExp: function(rank){
		return 500 * Math.pow(1.75, rank);
	},

	//---------------------------------------------------------
	//please dont pass params by reference or I will murder you
	//---------------------------------------------------------
	getEffectLeader: function(trait, defaultObject){
		var leaderRatio = 1;
		if (this.game.science.getPolicy("monarchy").researched){
			leaderRatio = 1.95;
		}
		if(this.leader) {
			var leaderTrait = this.leader.trait.name;
			if (leaderTrait == trait) {
				var burnedParagonRatio = 1 + this.game.prestige.getBurnedParagonRatio();
				// Modify the defautlObject depends on trait
				switch (trait) {
					case "engineer": // Crafting bonus
						defaultObject = 0.05 * burnedParagonRatio * leaderRatio;
						break;
					case "metallurgist": // Crafting bonus for non x-ium metallic stuff (plate, steel, gear, alloy)
						defaultObject = 0.1 * burnedParagonRatio * leaderRatio;
						break;
					case "chemist": // Crafting bonus for "chemical" stuff (concrete, eludium, kerosene, thorium)
						defaultObject = 0.075 * burnedParagonRatio * leaderRatio;
						break;
					case "merchant": // Trading bonus
						defaultObject = 0.03 * burnedParagonRatio * leaderRatio;
						break;
					case "manager": // Hunting bonus
						defaultObject = 0.5 * burnedParagonRatio * leaderRatio;
						break;
					case "scientist": // Science prices bonus
						for (var i = 0; i < defaultObject.length; i++) {
							if (defaultObject[i].name == "science") {
								defaultObject[i].val -= defaultObject[i].val 
									* this.game.getLimitedDR(0.05 * burnedParagonRatio  * leaderRatio, 1.0); //5% before BP
							}
						}
						break;
					case "wise": // Religion bonus
						for (var i = 0; i < defaultObject.length; i++) {
							if (defaultObject[i].name == "faith" || defaultObject[i].name == "gold") {
								defaultObject[i].val -= defaultObject[i].val 
									* this.game.getLimitedDR(0.09 + 0.01 * burnedParagonRatio * leaderRatio, 1.0); //10% before BP
							}
						}
						break;
				}

			}
		}
		return defaultObject;
	},

	updateEffectCached: function(){
		this.map.updateEffectCached();
	},

	constructor: function(game){
		this.game = game;
		this.sim = new classes.village.KittenSim(game);
		this.map = new classes.village.Map(game);

		this.jobNames = [];
		for (var i = 0; i < this.jobs.length; ++i) {
			this.jobNames.push(this.jobs[i].name);
		}
		this.senators = [];
		this.traits = [];
	},

	getJob: function(jobName){
		for (var i = this.jobs.length - 1; i >= 0; i--) {
			if (this.jobs[i].name == jobName){
				return this.jobs[i];
			}
		}
		throw "Failed to get job for job name '" + jobName + "'";
	},

	getJobLimit: function(jobName) {
		if (jobName == "engineer"){
			return this.game.bld.get("factory").val;
		} else {
			return 100000;
		}
	},

	assignJob: function(job, amt){
		var jobRef = this.getJob(job.name); 	//probably will fix missing ref on loading
		amt = Math.min(amt, this.getFreeKittens(), this.getJobLimit(job.name) - jobRef.value);

		if (amt > 0) {
			this.sim.assignJob(job.name, amt);
			jobRef.value += amt;
			if (job.name == "engineer") {
				this.game.workshopTab.updateTab();
			}
		}
	},

	unassignJob: function(kitten){
		var game = this.game,
			job = kitten.job;

		if (!job){
			return;
		}
		game.village.getJob(job).value--;
		game.village.sim.unassignCraftJobIfEngineer(job, kitten);

		kitten.job = null;
	},

	update: function(){
		//calculate kittens
		var kittensPerTick = this.kittensPerTickBase * (1 + this.game.getEffect("kittenGrowthRatio"));

		//Allow festivals to double birth rate.
		if (this.game.calendar.festivalDays > 0) {
			kittensPerTick = kittensPerTick * (2 + this.game.getEffect("festivalArrivalRatio"));
		}

		this.sim.maxKittens = this.maxKittens;

		var catnipPerTick = this.game.getResourcePerTick("catnip", true);
		var catnipVal = this.game.resPool.get("catnip").value;
		var resDiff = catnipVal + catnipPerTick;

		if (this.sim.getKittens() > 0){
			if (resDiff < 0 || this.game.challenges.isActive("winterIsComing") && this.sim.getKittens() > this.sim.maxKittens && this.game.calendar.weather == "cold") {

				var starvedKittens = Math.abs(Math.round(resDiff));
				if (starvedKittens > 1){
					starvedKittens = 1;
				}

				if (starvedKittens > 0 && this.deathTimeout <= 0){
					starvedKittens = this.sim.killKittens(starvedKittens);

					if (resDiff < 0) {
						this.game.msg(starvedKittens + ( starvedKittens === 1 ? " " + $I("village.msg.kitten") + " " : " " + $I("village.msg.kittens") + " " ) + $I("village.msg.starved"));
					} else {
						this.game.msg(starvedKittens + ( starvedKittens === 1 ? " " + $I("village.msg.kitten") + " " : " " + $I("village.msg.kittens") + " " ) + $I("village.msg.froze"));
					}
					this.game.deadKittens += starvedKittens;
					this.deathTimeout = this.game.ticksPerSecond * 5;	//5 seconds
				} else {
					this.deathTimeout--;
				}
				//Don't grow if kittens are starving
				this.sim.update(0);
			} else {
				this.sim.update(kittensPerTick);
			}
		} else{
			this.sim.update(kittensPerTick);
		}

		//check job limits
		for (var i = 0; i < this.jobs.length; i++) {
			var job = this.jobs[i];
			var jobName = job.name;
			var limit = this.getJobLimit(jobName);
			if (job.value > limit) {
				this.sim.removeJob(jobName, job.value - limit);
			}
		}

		if (this.getFreeKittens() < 0 ){
			this.clearJobs(true);	//sorry, just a stupid solution for this problem
		}

		//calculate production and happiness modifiers
		this.updateHappines();

        //XXX FW7: add some messeging system? Get rid of direct UI update calls completely?
		//this.game.ui.updateFastHunt();

		this.map.update();
	},

	fastforward: function(daysOffset){
		var times = daysOffset * this.game.calendar.ticksPerDay;
		//calculate kittens
		var kittensPerTick = this.kittensPerTickBase * (1 + this.game.getEffect("kittenGrowthRatio"));

		//Allow festivals to double birth rate.
		if (this.game.calendar.festivalDays > 0) {
			kittensPerTick = kittensPerTick * (2 + this.game.getEffect("festivalArrivalRatio"));
		}

		this.sim.maxKittens = this.maxKittens;
		this.sim.update(kittensPerTick, times);
	},

	getFreeKittens: function(){
		var workingKittens = 0;
		for (var i = this.jobs.length - 1; i >= 0; i--) {
			workingKittens += this.jobs[i].value;
		}

		var diligentKittens = this.game.challenges.isActive("anarchy")
			? Math.round(this.getKittens() * (0.5 - this.game.getLimitedDR(this.game.getEffect("kittenLaziness"), 0.25)))
			: this.getKittens();

		return diligentKittens - workingKittens;
	},

	hasFreeKittens: function(amt){
		amt = amt || 1;


		var freeKittens = this.getFreeKittens();
		return (freeKittens - amt) >= 0;
	},

	getWorkerKittens: function(jobName) {
		for (var i = this.jobs.length - 1; i >= 0; i--) {
			if (this.jobs[i].name == jobName) {
				return this.jobs[i].value;
			}
		}
		return 0;
	},

	getFreeEngineers: function() {
		var engineerNoFree = 0;
		for (var i = this.game.workshop.crafts.length - 1; i >= 0; i--) {
			engineerNoFree += this.game.workshop.crafts[i].value;
		}

		return this.getWorkerKittens("engineer") - engineerNoFree;
	},

	clearJobs: function(hard){
		for (var i = this.jobs.length - 1; i >= 0; i--) {
			var job = this.jobs[i];
			if (hard || job.name != "engineer") {
				job.value = 0;
			}
		}
		this.sim.clearJobs(hard);
		if (hard){
			this.game.workshop.clearEngineers();
		}
	},

	getKittens: function(){
		return this.sim.getKittens();
	},

	/**
	 * Get a list of resource modifiers per tick
	 *
	 * This method returns positive villager production that can be multiplied by building bonuses
	 */
	getResProduction: function(){
		if (!this.resourceProduction){
			this.updateResourceProduction();	//lazy synch
		}
		var res = dojo.clone(this.resourceProduction);

		//special hack for iron will mode
		var zebras = this.game.resPool.get("zebras");
		if (zebras.value > 0){
			res["manpower"] = res["manpower"] ? res["manpower"] : 0;
			res["manpower"] += 0.15;	//zebras are a bit stronger than kittens
		}
		if (zebras.value > 1){
			 res["manpower"] += this.game.getLimitedDR((zebras.value - 1) * 0.05, 2);
		}

		return res;
	},

	/**
	 * Get cumulative resource production per village population
	 */
	updateResourceProduction: function(){
		var res = {
		};

		var theocracy = this.game.science.getPolicy("theocracy");
		for (var i in this.sim.kittens){
			var kitten = this.sim.kittens[i];
			
			if (kitten.isLeader && theocracy.researched && 
				(kitten.job != theocracy.requiredLeaderJob))
			{
				kitten.isLeader = false;
				this.game.village.leader = null;
				var jobTitle = this.game.village.getJob(theocracy.requiredLeaderJob).title;
				this.game.msg($I("msg.policy.wrongLeaderJobDemoted", [theocracy.label, jobTitle]), "important");
			}
			if(kitten.job) {
				var job = this.getJob(kitten.job);
				if(job) {
					// Is there a shorter path to this function? I could go from gamePage but I'm trying to keep the style consistent.
					//TODO: move to the village manager
					var mod = this.game.village.getValueModifierPerSkill(kitten.skills[kitten.job] || 0);

					for (var jobResMod in job.modifiers){

						var diff = job.modifiers[jobResMod] + job.modifiers[jobResMod] * mod;

						if (diff > 0 ){
							if (kitten.isLeader){
								diff *= this.getLeaderBonus(kitten.rank);
							}
                            if ((!kitten.isLeader) && (this.game.village.leader)){
								diff *= (1 + (this.getLeaderBonus(this.game.village.leader.rank) - 1) 
								* this.game.getEffect("boostFromLeader"));
                            }
							diff *= this.happiness + (this.happiness - 1) 
							* this.game.getEffect("happinessKittenProductionRatio");	//alter positive resource production from jobs
						}

						if (!res[jobResMod]){
							res[jobResMod] = diff;
						}else{
							res[jobResMod] += diff;
						}
					}

					if (job.name == "engineer" && typeof(kitten.engineerSpeciality) != "undefined" && kitten.engineerSpeciality != null) {
						var jobResMod = "ES" + kitten.engineerSpeciality;

						var automationBonus = this.game.getEffect(kitten.engineerSpeciality + "AutomationBonus") || 0;
						var diff = 1 + automationBonus;

						var rankDiff = this.game.workshop.getCraft(kitten.engineerSpeciality).tier - kitten.rank;
						if (rankDiff > 0) {
							diff -= diff * rankDiff * 0.15;
						}

						diff += diff * mod;

						if (diff > 0 ){
							if (kitten.isLeader){
								diff *= this.getLeaderBonus(kitten.rank);
							}
                            if ((!kitten.isLeader) && (this.game.village.leader)){
								diff *= (1 + (this.getLeaderBonus(this.game.village.leader.rank) - 1)
								 * this.game.getEffect("boostFromLeader"));
                            }
							diff *= (this.game.science.getPolicy("liberty").researched)? 
							this.happiness + (this.happiness - 1) * 0.1 : this.happiness;
						}

						if (!res[jobResMod]){
							res[jobResMod] = diff;
						}else{
							res[jobResMod] += diff;
						}
					}

				}
			}
		}
		this.resourceProduction = res;
	},

	/**
	 * Update traits list for census filter
	 */
	updateTraits: function () {
		var traits = [];
		//TODO might be better to save traits count to get rid of this loop
		for (var i = 0; i < this.sim.kittens.length; i++) {
			var trait = this.game.village.sim.kittens[i].trait;
			if (traits.indexOf(trait) < 0) {
				traits.unshift(trait);
			}
		}
		this.traits = traits;
	},

	//leader production bonus in the assigned job
	getLeaderBonus: function(rank){
		var bonus = rank == 0 ? 1.0 : (rank + 1) / 1.4;
		if (this.game.science.getPolicy("authocracy").researched){
			bonus *= 2;
		}
		return bonus;
	},

	/**
	 * Same but with negative values
	 */

	getResConsumption: function(){
		var kittens = this.getKittens();
		var philosophyLuxuryModifier = 1 - this.game.getEffect("luxuryConsuptionReduction");
		var res = {
			"catnip" : this.catnipPerKitten * kittens,
			"furs" : -0.01 * kittens * philosophyLuxuryModifier,
			"ivory" : -0.007 * kittens * philosophyLuxuryModifier,
			"spice" : -0.001 * kittens * philosophyLuxuryModifier
        };
		return res;
	},

	resetState: function(){
		this.maxKittens = 0;
		this.sim.maxKittens = 0;
		this.leader = null;
		this.senators = [];
		this.sim.kittens = [];

		for (var i = 0; i < this.jobs.length; i++){
			var job = this.jobs[i];
			job.value = 0;
			job.unlocked = job.defaultUnlocked || false;
		}
	},

	save: function(saveData){
		var kittens = [];
		for (var i in this.sim.kittens){
			var _kitten = this.sim.kittens[i].save(this.game.opts.compressSaveFile, this.jobNames);
			kittens.push(_kitten);
		}

		saveData.village = {
			kittens : kittens,
			maxKittens: this.maxKittens,
			jobs: this.filterMetadata(this.jobs, ["name", "unlocked", "value"]),
			//map : this.map.villageData
		};
	},

	load: function(saveData){
		if (saveData.village){
			var kittens = saveData.village.kittens;
			//quick legacy hack, remove in future
			if (!kittens.length) {
				kittens = [];
			}

			this.sim.kittens = [];
			this.game.village.traits = [];

			for (var i = kittens.length - 1; i >= 0; i--) {
				var kitten = kittens[i];

				var newKitten = new com.nuclearunicorn.game.village.Kitten();
				newKitten.load(kitten, this.jobNames);

				if (this.game.village.traits.indexOf(newKitten.trait) < 0) {
					this.game.village.traits.unshift(newKitten.trait);
				}
	
				if (newKitten.isLeader){
						this.game.village.leader = newKitten;
				}
				/*if (newKitten.isSenator){
					this.game.village.senators.unshift(newKitten);
				}*/

				this.sim.kittens.unshift(newKitten);
			}

			this.maxKittens  = saveData.village.maxKittens;
			this.loadMetadata(this.jobs, saveData.village.jobs);

			/*if (saveData.village.map){
				this.map.villageData = saveData.village.map;
			}*/
		}

		this.updateResourceProduction();
	},

	getUnhappiness: function(){
		var populationPenalty = 2;
		if (this.game.science.getPolicy("fascism").researched) {
			return 0;
		}
		return ( this.getKittens() - 5 ) * populationPenalty * (1 + this.game.getEffect("unhappinessRatio"));
	},

    getEnvironmentEffect: function(){
		var game = this.game;

		return game.getEffect("environmentHappinessBonus") + game.getEffect("environmentUnhappiness") ;
	},
	
	/** Calculates a total happiness where result is a value of [0..1] **/
	updateHappines: function(){
		var happiness = 100;

		var unhappiness = this.getUnhappiness();
		if (this.getKittens() > 5){
			happiness -= unhappiness;	//every kitten takes 2% of production rate if >5
		}
        var enviromentalEffect = this.getEnvironmentEffect();
		var happinessBonus = this.game.getEffect("happiness");
		var challengeHappiness = this.game.getEffect("challengeHappiness");
		happiness += (happinessBonus + enviromentalEffect + challengeHappiness);

		//boost happiness/production by 10% for every uncommon/rare resource
		var resources = this.game.resPool.resources;
        var happinessPerLuxury = 10;
        //philosophy epicurianism effect
        happinessPerLuxury += this.game.getEffect("luxuryHappinessBonus");
		for (var i = resources.length - 1; i >= 0; i--) {
			if (resources[i].type != "common" && resources[i].value > 0){
				happiness += happinessPerLuxury;
				if(resources[i].name == "elderBox" && this.game.resPool.get("wrappingPaper").value){
					happiness -= happinessPerLuxury; // Present Boxes and Wrapping Paper do not stack.
				}
			}
		}

		if (this.game.calendar.festivalDays){
			happiness += 30 * (1 + this.game.getEffect("festivalRatio"));
		}

		var karma = this.game.resPool.get("karma");
		happiness += karma.value;	//+1% to the production per karma point

		var overpopulation = this.getKittens() - this.maxKittens;
		if (overpopulation > 0){
			var overpopulationPenalty = 2;
			happiness -= overpopulation * overpopulationPenalty;
		}

		if (happiness < 25){
			happiness = 25;
		}

		this.happiness = happiness / 100;
	},

	sendHunters: function() {
		this.gainHuntRes(1);
	},

	huntAll: function() {
		var squads = Math.floor(this.game.resPool.get("manpower").value / 100);
		if (squads >= 1) {
			this.game.resPool.addResEvent("manpower", -squads * 100);
			this.gainHuntRes(squads);
		}
		if(squads >= 1000&&!this.game.challenges.getChallenge("pacifism").unlocked){
			this.game.challenges.getChallenge("pacifism").unlocked = true;
		}
	},

	gainHuntRes: function (squads) {
		var unicorns = this.game.resPool.addResEvent("unicorns", this.game.math.binominalRandomInteger(squads, 0.05));
		if (unicorns > 0) {
			var unicornMsg = unicorns == 1
				? $I("village.new.one.unicorn")
				: $I("village.new.many.unicorns", [this.game.getDisplayValueExt(unicorns)]);
			this.game.msg(unicornMsg, "important", "hunt");
		}

		if (this.game.resPool.get("zebras").value >= 10) {
			var bloodstone = this.game.resPool.addResEvent("bloodstone", this.game.math.binominalRandomInteger(squads, this.game.resPool.get("bloodstone").value == 0 ? 0.05 : 0.0005));
			if (bloodstone > 0 && this.game.resPool.get("bloodstone").value == 1) {
				this.game.msg($I("village.new.bloodstone"), "important", "ironWill");
			}
		}

		var hunterRatio = this.game.getEffect("hunterRatio") + this.game.village.getEffectLeader("manager", 0);

		if (this.game.ironWill && this.game.workshop.get("goldOre").researched) {
			var goldHunts = this.game.math.binominalRandomInteger(squads, 0.25);
			var gold = this.game.resPool.addResEvent("gold", 5 * this.game.math.irwinHallRandom(goldHunts) + 5 * hunterRatio * this.game.math.irwinHallRandom(goldHunts));
			if (gold > 0) {
				this.game.msg($I("village.msg.hunt.gold", [this.game.getDisplayValueExt(gold)]), null, "hunt", true);
			}
		}

		var ivoryHunts = this.game.math.binominalRandomInteger(squads, 0.45 + 0.02 * hunterRatio);
		var ivory = this.game.resPool.addResEvent("ivory", 50 * this.game.math.irwinHallRandom(ivoryHunts) + 40 * hunterRatio * this.game.math.irwinHallRandom(ivoryHunts));
		if (ivory > 0) {
			this.game.msg($I("village.msg.hunt.ivory", [this.game.getDisplayValueExt(ivory)]), null, "hunt", true);
		}

		var furs = this.game.resPool.addResEvent("furs", 80 * this.game.math.irwinHallRandom(squads) + 65 * hunterRatio * this.game.math.irwinHallRandom(squads));
		if (furs > 0) {
			this.game.msg($I("village.msg.hunt.furs", [this.game.getDisplayValueExt(furs)]), null, "hunt", true);
		}

		var msg = $I("village.msg.hunt.success");
		if (squads > 1) {
			msg += $I("village.msg.hunt.from", [squads]);
		}
		this.game.msg(msg, null, "hunt");
	},

	holdFestival: function(amt){
		var festivalWasInProgress = this.game.calendar.festivalDays > 0;

		if (this.game.prestige.getPerk("carnivals").researched) {
			this.game.calendar.festivalDays += this.game.calendar.daysPerSeason * this.game.calendar.seasonsPerYear * amt;
		} else {
			this.game.calendar.festivalDays = this.game.calendar.daysPerSeason * this.game.calendar.seasonsPerYear;
		}

		if (festivalWasInProgress){
			this.game.msg($I("village.festival.msg.ext"));
		} else {
			this.game.msg($I("village.festival.msg.start"));
		}
		//TODO: some fun message like Molly Chalk is making a play 'blah blah'
	},

	rand: function(val){
		return this.game.rand(val);
	},

	/**
	 * Optimize distribution of jobs dependings on experiencies
	 */
	optimizeJobs: function() {

		var situationJobs = {};
		for (var i = this.game.village.sim.kittens.length - 1; i >= 0; i--) {
			var job = this.game.village.sim.kittens[i].job;
			if (job && job != "engineer") { // don't optimize engineers, headaches lie that way
				if (situationJobs[job] === undefined) {
					situationJobs[job] = 1;
				} else {
					situationJobs[job] = situationJobs[job] + 1;
				}
			}
		}

		if (Object.getOwnPropertyNames(situationJobs).length !== 0) {

			this.game.village.clearJobs(false);

		if(this.game.village.leader && this.game.science.getPolicy("theocracy").researched){//hack for theocracy; so that it stop being soo annoying
			this.game.village.leader.job = "priest";
			situationJobs["priest"] = situationJobs["priest"] - 1;
			this.game.village.getJob("priest").value += 1;
			if (situationJobs["priest"] == 0) {
				delete situationJobs["priest"];
			}
		}
			// Optimisation share between each jobs by assigning 1 kitten per job until all jobs are reassigned
			while (Object.getOwnPropertyNames(situationJobs).length !== 0) {
				for (var job in situationJobs) {
					this.assignJob(this.getJob(job), 1);
					if (situationJobs[job] == 1) {
						delete situationJobs[job];
					} else {
						situationJobs[job] = situationJobs[job] - 1;
					}
				}
			}

			this.game.msg($I("village.reassign.msg"));

			this.game.villageTab.updateTab();
			this.game.village.updateResourceProduction();
			this.game.updateResources();
		}
	},

	/**
	 * Promote all kittens - Priority to engineer to tier craft who have a rank below tier craft
	 */
	promoteKittens: function() {
		var candidates = [];
		for (var i = 0; i < this.sim.kittens.length; i++) {
			var tier = -1;
			if(this.sim.kittens[i].engineerSpeciality != null) {
				tier = this.game.workshop.getCraft(this.sim.kittens[i].engineerSpeciality).tier;
				if (this.sim.kittens[i].rank >= tier) {//if engineer already have required rank, it go to common pool
					tier = -1;
				}
			}
			candidates.push({"kitten": this.sim.kittens[i], "rank": tier});
		}

		if (candidates.length) {
			candidates.sort(function (a, b) {
				return b.rank - a.rank;
			});
			var promotedKittensCount = 0;
			var noGold = false;
			for (var i = 0; i < candidates.length; i++) {
				var promoted = this.sim.promote(candidates[i].kitten, candidates[i].rank > 0 ? candidates[i].rank : undefined);
				if (promoted > 0) {
					promotedKittensCount++;
				} else if (promoted < 0) {
					noGold = true;
				}
			}

			if (promotedKittensCount == 0) {
				this.game.msg($I(noGold ? "village.kittens.promotion.nogold" : "village.kittens.have.best.rank"));
			} else if (promotedKittensCount == 1) {
				this.game.msg($I("village.leader.promoted.one.kitten"));
			} else {
				this.game.msg($I("village.leader.promoted.many.kittens", [promotedKittensCount]));
			}
		}

	},

	getValueModifierPerSkill: function(value){
		var bonus = 0;
		switch (true) {
		case value < 100:
			break;
		case value < 500:
			bonus = 0.0125;
			break;
		case value < 1200:
			bonus = 0.025;
			break;
		case value < 2500:
			bonus = 0.045;
			break;
		case value < 5000:
			bonus = 0.075;
			break;
		case value < 9000:
			bonus = 0.125;
			break;
		default:
			bonus = 0.1875 * (1 + this.game.getLimitedDR(this.game.getEffect("masterSkillMultiplier"), 4));
		}
		return bonus * (1 + this.game.getEffect("skillMultiplier"));
	},

	getSkillExpRange: function(value){
		switch (true) {
		case value < 100:
			return [0,100];
		case value < 500:
			return [100,500];
		case value < 2500:
			return [500,2500];
		case value < 5000:
			return [2500,5000];
		case value < 9000:
			return [5000,9000];
		case value < 20000:
			return [9000,20000];
		default:
			return [20000,value];
		}
	}
});

/**
 * Kitten container
 */
dojo.declare("com.nuclearunicorn.game.village.Kitten", null, {

	statics: {
		SAVE_PACKET_OFFSET: 100
	},

	// 100 names MAX!
	// Add new names at the end of the list
	names: ["Angel", "Charlie", "Mittens", "Oreo", "Lily", "Ellie", "Amber", "Molly", "Jasper",
			"Oscar", "Theo", "Maddie", "Cassie", "Timber", "Meeko", "Micha", "Tami", "Plato",
			"Bea", "Cedar", "Cleo", "Dali", "Fiona", "Hazel", "Iggi", "Jasmine", "Kali", "Luna",
			"Reilly", "Reo", "Rikka", "Ruby", "Tammy"],
	// 100 surnames MAX!
	// Add new surnames at the end of the list
	surnames: ["Smoke", "Dust", "Chalk", "Fur", "Clay", "Paws", "Tails", "Sand", "Scratch", "Berry", "Shadow",
				"Ash", "Bark", "Bowl", "Brass", "Dusk", "Gaze", "Gleam", "Grass", "Moss", "Plaid", "Puff", "Rain",
				"Silk", "Silver", "Speck", "Stripes", "Tingle", "Wool", "Yarn"],

	traits: [{
		name: "scientist",
		title: $I("village.trait.scientist")
	},{
		name: "manager",
		title: $I("village.trait.manager")
	},{
		name: "engineer",
		title: $I("village.trait.engineer")
	},{
		name: "merchant",
		title: $I("village.trait.merchant")
	},{
		name: "wise",
		title: $I("village.trait.wise")
	},{
		name: "metallurgist",
		title: $I("village.trait.metallurgist")
	},{
		name: "chemist",
		title: $I("village.trait.chemist")
	},{
		name: "none",
		title: $I("village.trait.none")
	}],

	colors: [{
		color: "brown"
	},{
		color: "cinamon"
	},{
		color: "cream"
	},{
		color: "black"
	},{
		color: "fawn"
	},{
		color: "white"
	},{
		color: "lilac"
	}],

	varieties: [{
		style: "dual"
	},{
		style: "tabby"
	},{
		style: "torbie"
	},{
		style: "calico"
	},{
		style: "spots"
	}],

	name: "Undefined",
	surname: "Undefined",

	job: null,
	trait: null,

	age: 0,

	skills: null,
	exp: 0,
	rank: 0,

	rarity: 0,	//a growth/skill potential, 0 if none
	color: 0,	//kitten color, the higher the rarer, 0 if none
	variety: 0,	//rare kitten pattern variety


	isLeader: false,
	//obsolete
	isSenator: false,


	constructor: function(){
		this.name = this.names[this.rand(this.names.length)];
		this.surname = this.surnames[this.rand(this.surnames.length)];
		this.trait = this.traits[this.rand(this.traits.length)];

		//kittens tend to be on the younger side with some basic minimal age

		this.age = 5 + this.rand(10);
		if (this.rand(100) < 30){
			this.age += this.rand(30);
		}

		//10% of chance to generate one of 6 primary colors (rare colors TBD)
		if (this.rand(100) <= 10){
			this.color = this.rand(6) + 1;

			//10% of chance of colored cat to be one of 5 rare varieties (dual, tabby, torbie, calico, spots)
			if (this.rand(100) <= 10){
				this.variety = this.rand(4) + 1;
			}
		}
		//5% of kitten to be rarity 1 or 2, and extra 10% on top of it to be extra rare
		if (this.rand(100) <= 5){
			this.rarity = this.rand(2) + 1;
			if (this.rand(100) <= 10){
				this.rarity += 1;
			}
		}

		this.exp = 0;
		this.skills = {};
	},

	rand: function(ratio){
		return (Math.floor(Math.random() * ratio));
	},

	load: function(data, jobNames) {
		if (data.ssn != undefined) {
			this.loadCompressed(data, jobNames);
		} else {
			this.loadUncompressed(data);
		}
	},

	loadUncompressed: function(data) {
		this.name = 	data.name;
		this.surname =  data.surname;
		this.age = 		data.age;
		this.skills = 	data.skills;
		this.exp = 		data.exp || 0;
		this.trait = 	this.traits[this._getTraitIndex(data.trait.name)]; //load trait, getting current trait.title
		this.job = 		data.job;
		this.engineerSpeciality = data.engineerSpeciality || null;
		this.rank =		data.rank || 0;
		this.isLeader = data.isLeader || false;
		this.isSenator = false;
		this.isAdopted = data.isAdopted || false;
		this.color = 	data.color || 0;
		this.variety = 	data.variety || 0;
		this.rarity = data.rarity || 0;

		for (var job in this.skills) {
			if (this.skills[job] > 20001) {
				this.skills[job] = 20001;
			}
		}
	},

	loadCompressed: function(data, jobNames) {
		var ssn = this._splitSSN(data.ssn, 7);
		this.name = data.name || this.names[ssn[0]];
		this.surname = data.surname || this.surnames[ssn[1]];
		this.age = ssn[2];
		this.trait = this.traits[ssn[3]];
		this.color = ssn[4];
		this.variety = ssn[5];
		this.rarity = ssn[6];

		this.skills = {};
		var dataSkills = data.skills || 0;
		var sameSkill = typeof(dataSkills) == "number";
		for (var i = jobNames.length - 1; i >= 0; --i) {
			var skill = sameSkill ? dataSkills : (dataSkills[i] || 0);
			if (skill > 20001) {
				skill = 20001;
			}
			this.skills[jobNames[i]] = skill;
		}

		this.exp = data.exp || 0;
		this.job = data.job != undefined ? jobNames[data.job] : null;
		this.engineerSpeciality = data.engineerSpeciality || null;
		this.rank = data.rank || 0;
		this.isLeader = data.isLeader || false;
		this.isSenator = false;
		this.isAdopted = data.isAdopted || false;
	},

	/**
	 * As the max possible integer in JS is 2^53 ~= 90.07*100^7, with a packet offset of 100 only 7 numbers in 0..99 can be compressed, and the 8th number is limited to 0..89
	 */
	_splitSSN: function(mergedResult, numberOfValues) {
		var values = [];
		for (var i = 0; i < numberOfValues; ++i) {
			var value = mergedResult % this.statics.SAVE_PACKET_OFFSET;
			mergedResult -= value;
			mergedResult /= this.statics.SAVE_PACKET_OFFSET;
			values.push(value);
		}
		return values;
	},

	save: function(compress, jobNames) {
		return compress ? this.saveCompressed(jobNames) : this.saveUncompressed();
	},

	saveUncompressed: function() {
		//only save positive job skills to reduce save code size
		var saveSkills = {};
		for (var job in this.skills){
			if (this.skills[job] > 0){
				saveSkills[job] = this.skills[job];
			}
		}
		// don't serialize falsy values
		return {
			name: this.name,
			surname: this.surname,
			age: this.age,
			color: this.color || undefined,
			variety: this.variety || undefined,
			rarity: this.rarity || undefined,
			skills: saveSkills,
			exp: this.exp || undefined,
			trait: {name: this.trait.name},
			job: this.job || undefined,
			engineerSpeciality: this.engineerSpeciality || undefined,
			rank: this.rank || undefined,
			isLeader: this.isLeader || undefined,
			isAdopted: this.isAdopted || undefined
		};
	},

	saveCompressed: function(jobNames) {
		var skills = [];
		var minSkill = Number.MAX_VALUE;
		var maxSkill = -minSkill;
		for (var i = 0; i < jobNames.length; ++i) {
			var skill = this.skills[jobNames[i]] || 0;
			skills[i] = skill;
			minSkill = Math.min(skill, minSkill);
			maxSkill = Math.max(skill, maxSkill);
		}
		if (minSkill == maxSkill) {
			skills = maxSkill;
		}

		var nameIndex = this.names.indexOf(this.name);
		var surnameIndex = this.surnames.indexOf(this.surname);
		// don't serialize falsy values
		var compressedSave = {
			ssn: this._mergeSSN([
				nameIndex > -1 ? nameIndex : 0,
				surnameIndex > -1 ? surnameIndex : 0,
				this.age,
				this._getTraitIndex(this.trait.name),
				this.color,
				this.variety,
				this.rarity]),
			skills: skills || undefined,
			exp: this.exp || undefined,
			job: this.job ? jobNames.indexOf(this.job) : undefined,
			engineerSpeciality: this.engineerSpeciality || undefined,
			rank: this.rank || undefined,
			isLeader: this.isLeader || undefined,
			isAdopted: this.isAdopted || undefined
		};
		// Custom sur/names
		if (nameIndex <= 0 || surnameIndex <= 0) {
			compressedSave.name = this.name;
			compressedSave.surname = this.surname;
		}
		return compressedSave;
	},

	/**
	 * As the max possible integer in JS is 2^53 ~= 90.07*100^7, with a packet offset of 100 only 7 numbers in 0..99 can be compressed, and the 8th number is limited to 0..89
	 */
	_mergeSSN: function(values) {
		var result = 0;
		for (var i = values.length - 1; i >= 0; --i) {
			result *= this.statics.SAVE_PACKET_OFFSET;
			result += values[i];
		}
		return result;
	},

	_getTraitIndex: function(name) {
		for (var i = this.traits.length - 1; i >= 0; i--) {
			if (this.traits[i].name === name) {
				return i;
			}
		}
	}
});

dojo.declare("classes.village.Map", null, {
	game: null,
	villageData: null,

	villageLevel: 0,
	/*% explored, affects your priceRatio */
	exploredLevel: 0,
	supplies: 0,

	// point on map currently being explored
	expeditionNode: null,
	//point on map currently being selected
	selectedNode: null,

	//TODO: in a long run you can probably have multiple maps and multiple expeditions

	biomes: [{
		id: "forest",
		icon:"^",
		title:"Forest",
		terrainPenalty: 1.2,
		biomeChance: 0.2
	},{
		id: "boneForest",
		icon:"^.",
		title:"Bone Forest",
		terrainPenalty: 1.9,
		biomeChance: 0.02
	},{
		id: "rainForest",
		icon:"^`",
		title:"Rain Forest",
		terrainPenalty: 1.4,
		biomeChance: 0.1
	},{
		id: "mountain",
		icon:"*",
		title:"Mountain",
		terrainPenalty: 1.2,
		biomeChance: 0.05
	},{
		id: "desert",
		icon:"~",
		title:"Desert",
		terrainPenalty: 1.5,
		biomeChance: 0.08
	}],

	constructor: function(game){
		this.game = game;
		this.resetMap();
	},

	init: function(){
		this.villageData = {
			"3_2":{
				title: "v",
				type: "village",
				level: 1,
				cp: 0
			}
		};
	},

	resetMap: function(){
		this.init();
		this.mapgen();
	},

	generateTile: function(i, j){
		var key = i + "_" + j;

		for (var _biomeKey in this.biomes){
			var biome = this.biomes[_biomeKey];
			if (this.game.rand(100) <= (biome.biomeChance * 100)){
				this.villageData[key] = {
					title: biome.icon,
					type: biome.id,
					level: 0,
					cp: 0,
					unlocked: false,
					biomeInfo: biome
				};
			}
		}
		if (!this.villageData[key]){
			this.villageData[key] = {
				title: null,
				type: null,
				level: 0,
				cp: 0,
				unlocked: false,
				biomeInfo: null
			};
		}
		return this.villageData[key];
	},

	mapgen: function(){
		for (var i = 0; i < 7; i++){
			for (var j = 0; j < 7; j++){
				var key = i + "_" + j;
				if (this.villageData[key]){ continue; }

				for (var _biomeKey in this.biomes){
					var biome = this.biomes[_biomeKey];
					if (this.game.rand(100) <= (biome.biomeChance * 100)){
						this.villageData[key] = {
							title: biome.icon,
							type: biome.id,
							level: 0,
							cp: 0,
							unlocked: false,
							biomeInfo: biome
						};
					}
				}
				if (!this.villageData[key]){
					this.villageData[key] = {
						title: null,
						type: null,
						level: 0,
						cp: 0,
						unlocked: false,
						biomeInfo: null
					};
				}
			}
		}

		this.unlockTile(3,2);	//unlock village and 3x3 area around it
	},

	unlockTile: function(x, y){
		for (var i = x - 1; i <= x + 1; i++){
			for (var j = y - 1; j <= y + 1; j++){
				var tile = this.getTile(i, j);
				if (tile){
					tile.unlocked = true;
				}
			}
		}
	},

	getTile: function(x, y){
		var key = x + "_" + y,
			data = this.villageData[key];

		if (!data){
			data = this.generateTile(x, y);
		}
		return data;
	},

	toLevel: function(x, y){
		var key = x + "_" + y,
			data = this.villageData[key] || {
				level: 0,
			};

		var distance =  Math.sqrt(Math.pow(x - 3, 2) + Math.pow(y - 2, 2)) || 1;

		if (data.biomeInfo){
			distance *= data.biomeInfo.terrainPenalty;
		}

		var toLevel = 100 * (1 + 1.1 * Math.pow((distance - 1), 2.8)) * Math.pow(data.level + 1, 1.18 + 0.1 * distance);
		return toLevel;
	},

	update: function(){
		var exploredLevel = 0;

		for (var key in this.villageData){
			var cellData = this.villageData[key];
			if (cellData.level > 0){
				cellData.cp -= (0.1 * cellData.level);
				if (cellData.cp < 0){
					cellData.cp = 0;
				}
			}
			exploredLevel += cellData.level;

			if (cellData.type == "village"){
				this.game.globalEffectsCached["exploreRatio"] = (0.1 * (cellData.level - 1));
				this.villageLevel = cellData.level;
			}
		}

		this.exploredLevel = exploredLevel;

		if (this.expeditionNode){
			this.explore(this.expeditionNode.x, this.expeditionNode.y);
		}
	},

	explore: function(x, y){
        var dataset = this.villageData,
            data = this.getTile(x, y);

        var toLevel = this.toLevel(x, y),
            explorePower = 1 * (1 + this.getExploreRatio()),
            explorePrice = this.getExplorationPrice(x, y),
            catpower = this.game.resPool.get("manpower");

        if (catpower.value >= explorePrice){
            catpower.value -= explorePrice;

            data.cp += explorePower;
            if (data.cp >= toLevel){
                data.cp = 0;
                data.level++;

                this.expeditionNode = null;
                this.unlockTile(x, y);
            }
        }
	},

	getExplorationPrice: function(x, y){
        var data = this.getTile(x,y),
            explorePower = 1 * (1 + this.getExploreRatio()),
            price = explorePower * Math.pow(1.01, data.level);

		return price;
	},

	getExploreRatio: function(){
		return (this.villageLevel - 1) * 0.1;
	},

	getPriceReduction: function(){
		return Math.sqrt(this.exploredLevel - 1) * 0.00002;
	},

	updateEffectCached: function(){
		this.game.globalEffectsCached["mapPriceReduction"] = -this.getPriceReduction();
	}
});

/**
 * Detailed kitten simulation
 */
dojo.declare("classes.village.KittenSim", null, {

	kittens: null,

	game: null,

	/**
	 * If 1 or more, will increment kitten pool
	 */
	nextKittenProgress : 0,

	maxKittens: 0,

	constructor: function(game){
		this.kittens = [];
		this.game = game;
	},

	update: function(kittensPerTick, times){
		var game = this.game;
		if (!times) {
			times = 1;
		}

		if (this.kittens.length < this.maxKittens) {
			this.nextKittenProgress += times * kittensPerTick;
			if (this.nextKittenProgress >= 1) {
				var kittensToAdd = Math.floor(this.nextKittenProgress);
				this.nextKittenProgress -= kittensToAdd;

				for (var iCat = 0; iCat < kittensToAdd; iCat++) {
					if (this.kittens.length < this.maxKittens) {
						this.addKitten();
						if (this.maxKittens <= 10 && times == 1){
							game.msg($I("village.msg.kitten.has.joined"));
						}
					}
				}

				if (this.kittens.length >= this.maxKittens) {
					this.nextKittenProgress = 0;
				}
			}
		}

		var baseSkillXP = game.workshop.get("internet").researched ? Math.max(this.getKittens() / 10000, 0.01) : 0.01;
		var skillXP = (baseSkillXP + game.getEffect("skillXP")) * times;
		var neuralNetworks = game.workshop.get("neuralNetworks").researched;
		var skillsCap = 20001;

		for (var i = this.kittens.length - 1; i >= 0; i--) {
			var kitten = this.kittens[i];

			//special hack that migrates kittens to the global exp
			if (!kitten.exp){
				kitten.exp = 0;
				for (var skill in kitten.skills){
					kitten.exp += kitten.skills[skill];
				}
			}
			//hack
			if (kitten.rank === undefined){
				kitten.rank = 0;
			}
			//hack
			if (!kitten.trait){
				kitten.trait = kitten.traits[kitten.rand(kitten.traits.length)];
			}

			if (kitten.job && game.calendar.day >= 0 && !game.challenges.isActive("anarchy")){
				//Initialisation of job's skill
				if (!kitten.skills[kitten.job]){
					kitten.skills[kitten.job] = 0;
				}
				//Learning job's skill
				if (kitten.job != "engineer" || kitten.engineerSpeciality != null) {// Engineers who don't craft don't learn
					if (kitten.skills[kitten.job] < skillsCap){
						kitten.skills[kitten.job] = Math.min(kitten.skills[kitten.job] + skillXP, skillsCap);
					}
					kitten.exp += skillXP;
				}
				//Other job's skills
				if (neuralNetworks) {
					// Neural Networks Learning
					for (var j = game.village.jobs.length - 1; j >= 0; j--){
						if (game.village.jobs[j].unlocked) {
							var job = game.village.jobs[j].name;
							var jobValue = game.village.jobs[j].value;

							if (jobValue > 0 && kitten.skills[job] !== skillsCap){
								if (!kitten.skills[job]){
									kitten.skills[job] = 0;
								}

								var skillExp = times * 0.001 * jobValue;
								kitten.skills[job] = Math.min(kitten.skills[job] + skillExp, skillsCap);
							}
						}
					}
				} else {//Forget other skills
					for (var skill in kitten.skills){
						if (skill != kitten.job && kitten.skills[skill] > 0 ) {
							var skillExp = Math.min( times * 0.001, kitten.skills[skill]);
							kitten.skills[skill] -= skillExp;
							kitten.exp -= skillExp;
						}
					}
				}
			}
		}

	},

	addKitten: function() {
		var kitten = new com.nuclearunicorn.game.village.Kitten();
		this.kittens.push(kitten);
		if (this.game.village.traits.indexOf(kitten.trait) < 0) {
			this.game.village.traits.unshift(kitten.trait);
		}
		this.game.villageTab.updateTab();

        if (this.game.kongregate){
            this.game.kongregate.stats.submit("kittens", this.kittens.length);
        }

        this.game.stats.getStat("totalKittens").val++;
	},

	killKittens: function(amount){

		if (amount > this.kittens.length) {
			amount = this.kittens.length;
		}

        this.game.stats.getStat("kittensDead").val += amount;

		var killed = this.kittens.splice(this.kittens.length - amount, amount);
		var village = this.game.village;

		for (var i = killed.length - 1; i >= 0; i--){
			var kitten = killed[i];

			//fire dead kitten to keep craft worker counts in synch
			village.unassignJob(kitten);

			//remove dead kittens from government
			if (kitten === village.leader){
				village.leader = null;
			}
			/*if (kitten.isSenator){
				var k = village.senators.indexOf(kitten);
				if (k > -1){
					village.senators.splice(k,1);
				}
			}*/
		}
		this.game.villageTab.updateTab();
		this.game.workshopTab.updateTab();
		this.game.village.updateResourceProduction();
		this.game.village.updateTraits();
		this.game.updateResources();
		return killed.length;
	},

	sortKittensByExp: function() {
		this.kittens.sort(function(a,b) {
			var rankDiff = a.rank - b.rank;
			return rankDiff != 0 ? rankDiff : a.exp - b.exp;
		});
	},

	getKittens: function(){
		return this.kittens.length;
	},

	rand: function(ratio){
		return (Math.floor(Math.random() * ratio));
	},

	getSkillsSorted: function(skillsDict){
		var skills = [];
		for (var skill in skillsDict){
			skills.push({ "name": skill, "val": skillsDict[skill]});
		}
		skills.sort(function(a, b){return b.val - a.val;});
		return skills;
	},

	getSkillsSortedWithJob: function(skillsDict, job){
		var skills = [];
		for (var skill in skillsDict){
			if (skill != job) {
				skills.push({ "name": skill, "val": skillsDict[skill]});
			}
		}
		skills.sort(function(a, b){return b.val - a.val;});
		skills.unshift({ "name": job, "val": skillsDict[job]});
		return skills;
	},

	/**
	 * Assign a job to a free kitten :
	 * • With leader and register tech buy : a free kitten with Highest skill level in this job or any free if none
	 * • Else : the first free kitten
	 */
	assignJob: function(job, amt){
		var freeKittens = [];
		var optimizeJobs = this.game.workshop.get("register").researched && this.game.village.leader;

		for (var i = this.kittens.length - 1; i >= 0; i--) {
			var kitten = this.kittens[i];
			if (!kitten.job){
				if (!optimizeJobs) {
					freeKittens.push({"id": i});
					continue;
				}
				var val = kitten.skills[job] || 0;
				freeKittens.push({"id": i, "val": val, "leader": kitten.isLeader});
			}
		}

		if (optimizeJobs) {
			//sort leader before other kittens with the same skill level so it gets assigned before them
			freeKittens.sort(function(a, b){return b.val - a.val || b.leader - a.leader;});
		}

		amt = amt || 1;
		for (var i = amt - 1; i >= 0; i--) {

			if (freeKittens.length){
				var _freeKitten = freeKittens.shift();
				this.kittens[_freeKitten.id].job = job;
			} else {
				console.error("failed to assign job", job);
			}
		}

		this.game.village.updateResourceProduction();	//out of synch, refresh instantly
	},

	/**
	 * Same, but removes the least proficient worker or the first one
	 */
	removeJob: function(job, amt){
		var jobKittens = [];
		var optimizeJobs = (this.game.workshop.get("register").researched && this.game.village.leader);

		for (var i = this.kittens.length - 1; i >= 0; i--) {
			var kitten = this.kittens[i];
			if (kitten.job == job){
				if (!optimizeJobs) {
					jobKittens.push({"id": i});
					continue;
				}
				var val = kitten.skills[job] ? kitten.skills[job] : 0;
				jobKittens.push({"id": i, "val": val, "leader": kitten.isLeader});
			}
		}

		if (optimizeJobs) {
			//sort leader after other kittens with the same skill level so it gets unassigned after them
			//probably a bad idea to sort 50K kittens
			jobKittens.sort(function(a, b){return a.val - b.val || a.leader - b.leader;});
		}

		amt = amt || 1;
		for (var i = amt - 1; i >= 0; i--) {
			if (jobKittens.length){
				var _workingKitten = jobKittens.shift(),
					kitten = this.kittens[_workingKitten.id];

				this.game.village.unassignJob(kitten);
			}else{
				console.error("failed to remove job", job);
			}
		}

		this.game.village.updateResourceProduction();   //out of synch, refresh instantly
		if (job == "engineer") {
			this.game.workshopTab.updateTab();
		}
	},

	assignCraftJob: function(craft) {
		var optimizeJobs = (this.game.workshop.get("register").researched && this.game.village.leader) ? true : false;

		var freeKittens = [];
		for (var i = this.kittens.length - 1; i >= 0; i--) {
			var kitten = this.kittens[i];
			if (kitten.job == "engineer" && !kitten.engineerSpeciality){
				if (optimizeJobs) {
					var val = kitten.skills["engineer"] ? kitten.skills["engineer"] : 0;
					freeKittens.push({"id": i, "val": val, "rank": kitten.rank});
				} else {
					freeKittens.push({"id": i});
				}
			}
		}

		if (optimizeJobs) {
			freeKittens.sort(function(a, b){return b.val - a.val;});
			freeKittens.sort(function(a, b){return b.rank - a.rank;});
		}

		if (freeKittens.length){
			this.kittens[freeKittens[0].id].engineerSpeciality = craft.name;
			if (craft.name == "wood"){
				this.game.achievements.unlockHat("treetrunkHat");
			}
			return true;
		} else {
			//TODO: check free kittens and compare them with game.village.getFreeEngineers()
			//------------- hack start (todo: remove me someday -----
			/*if (this.game.village.getFreeEngineers() > 0){
				var job = this.game.village.getJob("engineer"),
					amt = job.value;
				for (var i = 0; i< amt; i++) {
					this.game.village.sim.removeJob("engineer");
				}
			}*/
			//------------ 	hack end -------------
			return false;
		}
	},

	unassignCraftJob: function(craft) {
		var optimization = (this.game.workshop.get("register").researched && this.game.village.leader != undefined) ? true : false;

		var jobKittens = [];
		for (var i = this.kittens.length - 1; i >= 0; i--) {
			var kitten = this.kittens[i];
            if (kitten.job == "engineer" && kitten.engineerSpeciality == craft.name){
				if (optimization) {
					var val = kitten.skills["engineer"] ? kitten.skills["engineer"] : 0;
					jobKittens.push({"id": i, "val": val, "rank": kitten.rank});
				} else {
					jobKittens.push({"id": i});
				}

            }
		}
		if (optimization) {
			jobKittens.sort(function(a, b){return b.val - a.val;});
			jobKittens.sort(function(a, b){return b.rank - a.rank;});
		}

        if (jobKittens.length){
			this.kittens[jobKittens[jobKittens.length - 1].id].engineerSpeciality = null;
			return true;
        } else {
            return false;
        }
	},

	unassignCraftJobIfEngineer: function(job, kitten) {
		if (job == "engineer" && kitten.engineerSpeciality) {
			var craft = this.game.workshop.getCraft(kitten.engineerSpeciality);
			if (craft && craft.value > 0) {
				craft.value--;
			}
		}
		kitten.engineerSpeciality = null; //ah sanity checks
	},

	clearCraftJobs: function() {
		for (var i = this.kittens.length - 1; i >= 0; i--) {
			this.kittens[i].engineerSpeciality = null;
		}
	},

	promote: function(kitten, rank) {
		var kittenRank = kitten.rank, rankDiff;
		if (typeof(rank) == "undefined") {
			rank = kitten.rank + 1;
			rankDiff = 1;
		} else {
			rankDiff = rank - kittenRank;
		}

		if (rankDiff <= 0) {
			return 0;
		}

		var expToPromote = this.expToPromote(kittenRank, rank, kitten.exp);
		var goldToPromote = this.goldToPromote(kittenRank, rank, this.game.resPool.get("gold").value);

		if (expToPromote[0] && goldToPromote[0]) {
			kitten.rank = rank;
			kitten.exp -= expToPromote[1];
			this.game.resPool.addResEvent("gold", -goldToPromote[1]);
			return 1;
		} else if (rankDiff > 1) { // If rank is unreachable, try one rank
			return this.promote(kitten);
		} else if (expToPromote[0] && !goldToPromote[0]) {
			return -1;
		}
	},

	expToPromote: function(rankBase, rankFinal, expNeeded) {
		var expToPromote = 0;
		for (var i = 0; i < (rankFinal - rankBase); i++) {
			expToPromote += this.game.village.getRankExp(rankBase + i);
		}
		if (expToPromote > expNeeded) {
			return [false, 0];
		} else {
			return [true, expToPromote];
		}
	},

	goldToPromote: function(rankBase, rankFinal, goldNeeded) {
		var goldToPromote = 0;
		for (var i = 0; i < (rankFinal - rankBase); i++) {
			goldToPromote += 25 * (rankBase + i + 1);
		}
		if (goldToPromote > goldNeeded) {
			return [false, 0];
		} else {
			return [true, goldToPromote];
		}
	},

	clearJobs: function(hard){
		for (var i = this.kittens.length - 1; i >= 0; i--) {
			var kitten = this.kittens[i];
			if (hard || kitten.job != "engineer") { // only fire engineers if hard flag is passed
				kitten.job = null;
				kitten.engineerSpeciality = null;
			}
		}
	}

});

dojo.declare("com.nuclearunicorn.game.ui.JobButtonController", com.nuclearunicorn.game.ui.ButtonModernController, {

	defaults: function() {
		var result = this.inherited(arguments);
		result.tooltipName = true;
		return result;
	},

	initModel: function(options) {
		var model = this.inherited(arguments);
		model.job = this.getJob(model);
		return model;
	},

	getJob: function(model){
		return this.game.village.getJob(model.options.job);
	},

	updateEnabled: function(model){
		this.inherited(arguments);
		if (!this.game.village.hasFreeKittens() || this.game.village.getJobLimit(model.options.job) <= this.game.village.getWorkerKittens(model.options.job)){
			model.enabled = false;
		}
	},

	getName: function(model){
		var name = this.inherited(arguments);
		return name + " (" + model.job.value + ")";
	},

	getDescription: function(model){
		return model.job.description;
	},

	updateVisible: function(model){
		model.visible = model.job.unlocked;
	},

	clickHandler: function(model, event){
		if (event.ctrlKey || event.metaKey /*osx tears*/){
			this.assignJobs(model, this.game.opts.batchSize || 10);
		} else if (event.shiftKey){
			if (this.game.opts.noConfirm){
				this.assignAllJobs(model);
			} else {
				var self = this;
				this.game.ui.confirm("", $I("village.btn.assignall.confirmation.msg"), function() {
					self.assignAllJobs(model);
				}, function() {
				});
			}
		} else {
			this.assignJobs(model, 1);
		}
	},

	unassignJobs: function(model, amt){
		var job = model.job;

		if (job.value < amt){
			amt = job.value;
		}

		if (amt > 0) {
			this.game.village.sim.removeJob(job.name, amt);
		}
	},

	unassignAllJobs: function(model){
		this.unassignJobs(model, model.job.value);
	},

	assignJobs: function(model, amt){
		this.game.village.assignJob(model.job, amt);
	},

	assignAllJobs: function(model){
		var freeKittens = this.game.village.getFreeKittens();
		this.assignJobs(model, freeKittens);
	},

	fetchModel: function(options){
		var model = this.inherited(arguments);
		var self = this;
		model.unassignLinks = [
		  {
				id: "unassign",
				title: "[&ndash;]",
				alt: "minus",
				handler: function(){
					self.unassignJobs(model, 1);
				}
		   },{
				id: "unassign5",
				title: "[-5]",
				handler: function(){
					self.unassignJobs(model, 5);
				}
		   },{
				id: "unassign25",
				title: "[-25]",
				handler: function(){
					self.unassignJobs(model, 25);
				}
		   },{
				id: "unassignAll",
				title: $I("btn.all.unassign"),
				handler: function(){
					self.unassignAllJobs(model);
				}
		   }];

		model.assignLinks = [
			{
				id: "assign",
				title: "[+]",
				alt: "plus",
				handler: function(){
					self.assignJobs(model, 1);
				}
		   },{
				id: "assign5",
				title: "[+5]",
				handler: function(){
					self.assignJobs(model, 5);
				}
		   },{
				id: "assign25",
				title: "[+25]",
				handler: function(){
					self.assignJobs(model, 25);
				}
		   },{
				id: "assignall",
				title: $I("btn.all.assign"),
				handler: function(){
					self.assignAllJobs(model);
				}
		   }];
		return model;
	},

	getEffects: function(model) {
		var job = model.job;
		return job.modifiers;
	},
	getFlavor: function(model) {
		var job = model.job;
		return job.flavour;
	}
});

dojo.declare("com.nuclearunicorn.game.ui.JobButton", com.nuclearunicorn.game.ui.ButtonModern, {

	renderLinks: function(){

		this.unassignLinks = this.addLinkList(this.model.unassignLinks);

		this.assignLinks = this.addLinkList(this.model.assignLinks);
	}
});

dojo.declare("classes.ui.village.Census", null, {

	game: null,
	records: null,
	container: null,

	filterJob: null,
	filterTrait: null,

	constructor: function(game){
		this.game = game;
		this.records = [];
	},

	render: function(container){
		this.records = [];
		this.container = container;

		dojo.empty(container);

		//--------------------------------------------------------------------------------------
		this.governmentDiv = null;
		if (!this.game.challenges.isActive("anarchy")) {
			this.renderGovernment(container);
		}
		//--------------------------------------------
		var navbar = dojo.create("div", { className: "censusFilters", style: {
			height: "24px"
		}}, container);


		//--------------- trait filter -----------------

		var traitSelect = dojo.create("select", {style: {float: "right"}}, navbar);
		dojo.create("option", {value: "", innerHTML: $I("village.trait.filter.all")}, traitSelect);

		for (var i = 0; i < this.game.village.traits.length; i++) {
			var trait = this.game.village.traits[i];
			dojo.create("option", {
				value: trait.name, innerHTML: trait.title,
				selected: (trait.name === this.filterTrait)
			}, traitSelect);
		}

		dojo.connect(traitSelect, "onchange", this, function (event) {
			this.filterTrait = event.target.value;
			this.render(this.container);
		});

		//--------------- job filter -----------------

		//console.log("filter job:", this.filterJob);

		var jobSelect = dojo.create("select", { style: {float: "right" }}, navbar);

		dojo.create("option", { value: "", innerHTML: $I("village.census.filter.all")}, jobSelect);
		for (var i = 0; i < this.game.village.jobs.length; i++){
			var job = this.game.village.jobs[i];
			if (job.unlocked){
				dojo.create("option", { value: job.name, innerHTML: job.title,
					selected: (job.name === this.filterJob)
				}, jobSelect);
			}
		}

		dojo.connect(jobSelect, "onchange", this, function(event){
			var job = event.target.value;
			this.filterJob = job;
			this.render(this.container);
		});

		var kittensLimit = 0;

		var sim = this.game.village.sim;
		sim.sortKittensByExp();

		for (var i = sim.kittens.length - 1; i >= 0 && kittensLimit < 10; i--) {

			var kitten = sim.kittens[i];

			if ((this.filterJob && kitten.job !== this.filterJob) || (this.filterTrait && kitten.trait.name !== this.filterTrait)) {
				continue;
			}

			kittensLimit++;

			var div = dojo.create("div", {
				className: "census-block",
				innerHTML: ""
			}, container );

			dojo.addClass(div,(kitten.isLeader ? " simLeader" : ""));
			//--------- content -----------

			var content = dojo.create("div", {
				style: {
					display: "inline-block"
				}
			}, div);

			//--------- links -----------

			var linksDiv = dojo.create("div", {
				style: {
					display: "inline-block",
					float: "right"
				}
			}, div);

			if (!this.game.challenges.isActive("anarchy")) {
				var leaderHref = dojo.create("a", {
					href: "#", innerHTML: "",
					className: "leaderHref",
					style: {
						float: "right"
					},
					title: "Make a leader"
				}, linksDiv);
			}

			var unassignHref = dojo.create("a", {
				href: "#", innerHTML:  $I("village.btn.unassign.job"),
				className: "unassignHref",
				style: {
					display: kitten.job ? "block" : "none",
					clear: "both"
				}
			}, linksDiv);

			dojo.connect(unassignHref, "onclick", this, dojo.partial(function(game, i, event){
				event.preventDefault();
				game.village.unassignJob(game.village.sim.kittens[i]);
				game.village.updateResourceProduction();
				game.render();

			}, this.game, i));

			if (!this.game.challenges.isActive("anarchy")) {
				dojo.connect(leaderHref, "onclick", this, dojo.partial(function(census, i, event){
					event.preventDefault();
					var game = census.game;

					var kitten = game.village.sim.kittens[i];
					//TODO: fix other side effects (should we just rerender census on kitten's death?)
					if (!kitten){	//if kitten is dead, old button may still stay, causing very strange behavior
						return;
					}
					census.makeLeader(kitten);

					census.renderGovernment(census.container);
					this.render(this.container);
					game.ui.updateTabs();
					census.update();
				}, this, i));
			}

			this.records.push({
				content: content,
				kitten: kitten,
				unassignHref: unassignHref,
                /*senatorHref: senatorHref,*/
                leaderHref: leaderHref
			});
		}
	},

	makeLeader: function(kitten){
		var theocracy = this.game.science.getPolicy("theocracy");
		if((theocracy.researched) && (kitten.job != theocracy.requiredLeaderJob)){
			var jobTitle = this.game.village.getJob(theocracy.requiredLeaderJob).title;
			this.game.msg($I("msg.policy.kittenNotMadeLeader", [theocracy.label, jobTitle]), "important");
             //can't assign non-priest leaders if orderOfTheStars is researched
			return;
		}
		var game = this.game;
		if (game.village.leader){
			game.village.leader.isLeader = false;
		}
		
		kitten.isLeader = true;
		game.village.leader = kitten;
		
	},

	getGovernmentInfo: function() {
		//update leader stats
		var leaderInfo = "%username%";
		var leader = this.game.village.leader;
		if (leader) {
			var title = leader.trait.name == "none"
				? $I("village.census.trait.none")
				: leader.trait.title + " (" + $I("village.bonus.desc." + leader.trait.name) + ") [" + $I("village.census.rank") + " " + leader.rank + "]";
			var nextRank = Math.floor(this.game.village.getRankExp(leader.rank));
			leaderInfo = this.getStyledName(leader, true /*is leader panel*/) + ", " + title +
				"<br /> exp: " + this.game.getDisplayValueExt(leader.exp);

			if (nextRank > leader.exp) {
				leaderInfo += " (" + Math.floor(100 * leader.exp / nextRank) + "%)";
			}

			if (leader.rank > 0) {
				leaderInfo += "<br /><br />" + $I("village.job.bonus") + ": x" + this.game.village.getLeaderBonus(leader.rank).toFixed(1) + " (" + (leader.job ? this.game.village.getJob(leader.job).title : "") + ")";
			}
		}

		return {
			leaderInfo: leaderInfo
		};
	},

	getSkillInfo: function(kitten){
		//--------------- skills ----------------
		var skillsArr = kitten.job 	? this.game.village.sim.getSkillsSortedWithJob(kitten.skills, kitten.job)
			: this.game.village.sim.getSkillsSorted(kitten.skills);

		var info = "";

		for (var j = 0; j < Math.min(skillsArr.length,3) ; j++) {

			var exp = skillsArr[j].val,
				style = "",
				bonus = "";

			if (exp <= 0 || typeof(exp) == "undefined") {
				break;
			}

			var skillExp = this.game.village.getSkillExpRange(exp);
			var prevExp = skillExp[0];
			var nextExp = skillExp[1];

			var expDiff = exp - prevExp;
			var expRequried = nextExp - prevExp;

			var expPercent = (expDiff / expRequried) * 100;

			if (skillsArr[j].name == kitten.job) {
				style = "style='font-weight: bold'";

				var mod = this.game.village.getValueModifierPerSkill(kitten.skills[kitten.job]);
				bonus = mod > 0 && kitten.isLeader ? (this.game.village.getLeaderBonus(kitten.rank) * (mod + 1) - 1) : mod;

				//TODO: move me to getFromLeaderBonus
				bonus = bonus > 0 && !kitten.isLeader && 
					this.game.village.leader ? 
					(this.game.village.getLeaderBonus((this.game.village.leader || 0).rank) * this.game.getEffect("boostFromLeader") + 1)
					* (bonus + 1) - 1 : bonus;
				bonus = bonus * 100;
				bonus = bonus > 0 ? " +" + bonus.toFixed(0) + "%" : "";
			}

			info += "<span class='skill' title='" + exp.toFixed(2) + "'" + style + ">"
				+ this.game.village.getJob(skillsArr[j].name).title + bonus
				+ " (" + this.game.villageTab.skillToText(exp) + " " + expPercent.toFixed() + "%)"
				+ "</span><br>";
		}

		return info;
	},

	renderGovernment: function(container){
		var governmentDiv = this.governmentDiv;
		if (!this.governmentDiv){
			governmentDiv = dojo.create("div", { className: "currentGovernment", style: {
				paddingBottom: "10px"
			}}, container);
			this.governmentDiv = governmentDiv;
		} else {
			dojo.empty(governmentDiv);
		}

		this.leaderDiv = dojo.create("div", {className: "currentLeader"}, governmentDiv);
		//------------------------------------
		var leader = this.game.village.leader;
		var gold = this.game.resPool.get("gold");
		if (leader) {
			var expToPromote = this.game.village.getRankExp(leader.rank);
			var goldToPromote = 25 * (leader.rank + 1);
			this.promoteLeaderHref = dojo.create("a", {
				href: "#", innerHTML: $I("village.census.leader.propmote", [this.game.getDisplayValueExt(expToPromote.toFixed()), goldToPromote]),
				style: {
					display:
						(leader.exp < expToPromote || gold.value < goldToPromote) ? "none" : "block"
				}
			}, this.governmentDiv);

			dojo.connect(this.promoteLeaderHref, "onclick", this, dojo.partial(function(census, leader, event){
				event.preventDefault();
				this.game.village.sim.promote(leader);
				census.renderGovernment(census.container);
				census.update();

			}, this, leader));

			var div = dojo.create("div", null, this.governmentDiv);

			this.unassignLeaderJobHref = dojo.create("a", {
				href: "#", innerHTML: $I("village.btn.unassign"),
				style: {
					display:
						(leader.job) ? "inline-block" : "none"
				}
			}, div);

			dojo.connect(this.unassignLeaderJobHref, "onclick", this, dojo.partial(function(census, leader, event){
				event.preventDefault();
				var game = census.game;

				if(leader.job){
					game.village.unassignJob(leader);
					game.village.updateResourceProduction();

					census.renderGovernment(census.container);
					census.update();
					game.render();
				}

			}, this, leader));
		}
	},

	getStyledName: function(kitten, isLeaderPanel){
		return "<span class='name color-" +
			((kitten.color && kitten.colors[kitten.color + 1]) ? kitten.colors[kitten.color + 1].color : "none") +
			" variety-" + ((kitten.variety && kitten.varieties[kitten.variety + 1]) ? kitten.varieties[kitten.variety + 1].style : "none") +
			"'>" +
			(isLeaderPanel ? ":3 " : "") + kitten.name + " " + kitten.surname +
		"</span>";
	},

	update: function(){

		//update leader stats
		var leader = this.game.village.leader;
		if (leader && this.unassignLeaderJobHref){
			this.unassignLeaderJobHref.style.display = leader.job ? "block" : "none";
		}
		//TODO: promote leader link
		var govInfo = this.getGovernmentInfo();

		if (!this.game.challenges.isActive("anarchy")) {
			this.leaderDiv.innerHTML = "<strong>" + $I("village.census.lbl.leader") + ":</strong> " + govInfo.leaderInfo;
		}

		//TODO: update senators

		for (var i = 0; i < this.records.length; i++) {
            var record = this.records[i];
            var kitten = record.kitten;

            //unassign link
            if (kitten.job) {
                dojo.style(record.unassignHref, "display", "block");
            } else {
                dojo.style(record.unassignHref, "display", "none");
			}
			
			record.content.innerHTML =
				"<div class='info'>" + this.getStyledName(kitten) +
				 ", " + kitten.age + " " + $I("village.census.age") + ", "
				+ kitten.trait["title"]
				+ (kitten.rank == 0 ? "" : " (" + $I("village.census.rank") + " " + kitten.rank + ")") + "</div>";

            //--------------- skills ----------------
			/*
				var skillsArr = kitten.job 	? this.game.village.sim.getSkillsSortedWithJob(kitten.skills, kitten.job)
										: this.game.village.sim.getSkillsSorted(kitten.skills);
			*/

            var skillInfo = this.getSkillInfo(kitten);
			record.content.innerHTML += skillInfo;

			if (!this.game.challenges.isActive("anarchy")) {
				record.leaderHref.innerHTML = kitten.isLeader ? "&#9733;" : "&#9734;"; //star-shaped link to reduce visual noise
			}

		}
	}

});

dojo.declare("com.nuclearunicorn.game.ui.CensusPanel", com.nuclearunicorn.game.ui.Panel, {
	census: null,

	constructor: function(name, village, game){
		this.census = new classes.ui.village.Census(game);
	},

	render: function(container){
		var panelContainer = this.inherited(arguments);
		this.census.render(panelContainer);
	},

	update: function(){
		this.census.update();
	}
});

dojo.declare("classes.village.ui.VillageButtonController", com.nuclearunicorn.game.ui.ButtonModernController, {

	defaults: function() {
		var result = this.inherited(arguments);
		result.simplePrices = false;
		result.hasResourceHover = true;
		return result;
	}
});

dojo.declare("classes.village.ui.FestivalButtonController", classes.village.ui.VillageButtonController, {
	fetchModel: function(options) {
		var model = this.inherited(arguments);
		model.x10Link = this._newLink(10);
		model.x100Link = this._newLink(100);
		return model;
	},

    _newLink: function(holdQuantity) {
        var self = this;
        return {
        	title: "x" + holdQuantity,
            visible: this.game.prestige.getPerk("carnivals").researched && (this.game.opts.showNonApplicableButtons || this.hasMultipleResources(holdQuantity)),
            handler: function(btn, callback){
				if (!self.hasMultipleResources(holdQuantity)) {
					callback(false);
					return;
				}
				self.game.villageTab.holdFestival(holdQuantity);
				self.game.resPool.addResEvent("manpower", -1500 * holdQuantity);
				self.game.resPool.addResEvent("culture", -5000 * holdQuantity);
				self.game.resPool.addResEvent("parchment", -2500 * holdQuantity);
				callback(true);
			}
        };
    },

	updateVisible: function (model) {
		model.visible = this.game.science.get("drama").researched;
	},

	hasMultipleResources: function(amt){
		return (
			this.game.resPool.get("manpower").value >= 1500 * amt &&
			this.game.resPool.get("culture").value >= 5000 * amt &&
			this.game.resPool.get("parchment").value >= 2500 * amt
		);
	}
});

dojo.declare("classes.village.ui.FestivalButton", com.nuclearunicorn.game.ui.ButtonModern, {
	renderLinks: function() {
		this.x100 = this.addLink(this.model.x100Link);
		this.x10 = this.addLink(this.model.x10Link);
	},

	update: function() {
		this.inherited(arguments);
		dojo.style(this.x10.link, "display", this.model.x10Link.visible ? "" : "none");
		dojo.style(this.x100.link, "display", this.model.x100Link.visible ? "" : "none");

        if  (this.model.x100Link.visible) {
			dojo.addClass(this.x100.link,"rightestLink");
			dojo.removeClass(this.x10.link,"rightestLink");
        } else if (this.model.x10Link.visible) {
            dojo.addClass(this.x10.link,"rightestLink");
        }
	}
});

/**
 * Village tab to manage jobs
 */
dojo.declare("com.nuclearunicorn.game.ui.tab.Village", com.nuclearunicorn.game.ui.tab, {

	tdTop: null,

	advModeButtons : null,

	huntBtn: null,

	festivalBtn: null,

	constructor: function(tabName, game){
		this.game = game;

		this.advModeButtons = [];
	},

	createJobBtn: function(job, game){
		var btn = new com.nuclearunicorn.game.ui.JobButton({
			name : job.title,
			job: job.name,
			controller: new com.nuclearunicorn.game.ui.JobButtonController(game)
		}, game);
		return btn;
	},

	render: function(tabContainer){
		this.advModeButtons = [];
		this.buttons = [];

		this.jobsPanel = new com.nuclearunicorn.game.ui.Panel($I("village.panel.job"), this.game.village);
		if (this.game.ironWill && !this.game.village.getKittens()){
			this.jobsPanel.setVisible(false);
		}

		var jobsPanelContainer = this.jobsPanel.render(tabContainer);

		var table = dojo.create("table", { className: "table",
			style:{
			width: "100%"
		}}, jobsPanelContainer);


		//-----------------------------------------------------------
		for (var i = 0; i < this.game.village.jobs.length; i++){
			var job = this.game.village.jobs[i];

			var btn = this.createJobBtn(job, this.game);

			btn.updateEnabled();
			btn.updateVisible();

			btn.render(jobsPanelContainer);
			this.addButton(btn);
		}

		var btn = new com.nuclearunicorn.game.ui.ButtonModern({ name: $I("village.btn.job.clear"),
			description: $I("village.btn.job.clear.desc"),
			handler: dojo.hitch(this, function() {
				var game = this.game;
				if (game.opts.noConfirm) {
					game.village.clearJobs(true);
				} else {
					game.ui.confirm("", $I("village.tab.clear.job.confirmation.msg"), function() {
						game.village.clearJobs(true);
					});
				}
			}),
			controller: new com.nuclearunicorn.game.ui.ButtonModernController(this.game)
		}, this.game);
		btn.render(jobsPanelContainer);
		this.addButton(btn);
		//------------------------------------------------------------

		dojo.create("tr", null, table);

		var tdTop = dojo.create("td", { colspan: 2 },
			dojo.create("tr", null, table));

		this.tdTop = tdTop;

		//--------------------------	map ---------------------------
		/*var isMapVisible = this.game.science.get("archery").researched &&
			this.game.resPool.get("paragon").value >= 5; */

		this.mapPanel = new com.nuclearunicorn.game.ui.Panel("Map", this.game.village);
		this.mapPanel.setVisible(false);

		/*if (this.mapPanelViewport){
			React.unmountComponentAtNode(this.mapPanelViewport);
		}
		this.mapPanelViewport = this.mapPanel.render(tabContainer);
		React.render($r(WMapSection, {
            game: this.game
        }), this.mapPanelViewport);*/

		//----------------- happiness and things ----------------------

		this.statisticsPanel = new com.nuclearunicorn.game.ui.Panel($I("village.panel.management"), this.game.village);
		if (this.game.village.getKittens() < 5 && this.game.resPool.get("zebras").value == 0){
			this.statisticsPanel.setVisible(false);
		}
		var statPanelContainer = this.statisticsPanel.render(tabContainer);

		var advVillageTable = dojo.create("table", { style: {
				width: "100%"
			}}, statPanelContainer);

		this.advVillageTable = advVillageTable;


		var tr = dojo.create("tr", {}, advVillageTable);
		var statsTd = dojo.create("td", { style: "cursor: pointer; width: 50%; text-align: center;"}, tr);

		UIUtils.attachTooltip(this.game, statsTd, 0, 200, dojo.hitch(this, function(){
			return $I("village.panel.management.desc");
		}));

		this.happinessStats = statsTd;

		var controlsTd = dojo.create("td", {}, tr);

		//hunt
		var huntBtn = new com.nuclearunicorn.game.ui.ButtonModern({
				name: $I("village.btn.hunters"),
				description: $I("village.btn.hunters.desc"),
				handler: dojo.hitch(this, function(){
					this.sendHunterSquad();
				}),
				prices: [{ name : "manpower", val: 100 }],
				controller: new classes.village.ui.VillageButtonController(this.game, {
					updateVisible: function (model) {
						model.visible = this.game.science.get("archery").researched && (!this.game.challenges.isActive("pacifism"));
					}
				})
		}, this.game);
		huntBtn.render(controlsTd);
		this.huntBtn = huntBtn;

		//festival
		var festivalBtn = new classes.village.ui.FestivalButton({
				name: $I("village.btn.festival"),
				description: $I("village.btn.festival.desc"),
				handler: dojo.hitch(this, function(){
					this.holdFestival(1);
				}),
				prices: [
					{ name : "manpower", val: 1500 },
					{ name : "culture", val: 5000 },
					{ name : "parchment", val: 2500 }
				],
				controller: new classes.village.ui.FestivalButtonController(this.game)
		}, this.game);
		festivalBtn.render(controlsTd);
		this.festivalBtn = festivalBtn;

		//manage
		var optimizeJobsBtn = new com.nuclearunicorn.game.ui.ButtonModern({
			name: $I("village.btn.manage"),
			description: $I("village.btn.manage.desc"),
			handler: dojo.hitch(this, function(){
				this.game.village.optimizeJobs();
			}),
			controller: new classes.village.ui.VillageButtonController(this.game, {
				updateVisible: function (model) {
					model.visible = this.game.village.leader != undefined 
					&& this.game.workshop.get("register").researched 
					&& !this.game.challenges.isActive("anarchy");
				}
			})
		}, this.game);
		optimizeJobsBtn.render(controlsTd);
		this.optimizeJobsBtn = optimizeJobsBtn;

		//promote
		var promoteKittensBtn = new com.nuclearunicorn.game.ui.ButtonModern({
			name: $I("village.btn.promote"),
			description: $I("village.btn.promote.desc"),
			handler: dojo.hitch(this, function(){
				this.game.village.promoteKittens();
			}),
            controller: new classes.village.ui.VillageButtonController(this.game, {
				updateVisible: function (model) {
					model.visible = this.game.village.leader !== undefined && 
					this.game.workshop.get("register").researched && 
					!this.game.challenges.isActive("anarchy");
				}
			})
		}, this.game);
		promoteKittensBtn.render(controlsTd);
		this.promoteKittensBtn = promoteKittensBtn;

		//redeemGift
		var config = new classes.KGConfig();
		var redeemGiftBtn = new com.nuclearunicorn.game.ui.ButtonModern({
			name: $I("village.btn.unwrap"),
			description: "",
			handler: dojo.hitch(this, function() {
				var game = this.game;
				game.ui.confirm("", $I("village.btn.unwrap.confirmation.msg"), function() {
					game.redeemGift();
					game.render();
				});
			}),
			controller: new classes.village.ui.VillageButtonController(this.game, {
				updateVisible: function (model) {
					model.visible = !this.game.isEldermass() && (this.game.resPool.get("elderBox").value > 0);
				}
			})
		}, this.game);
		redeemGiftBtn.render(controlsTd);
		this.redeemGiftBtn = redeemGiftBtn;

		//--------------- bureaucracy ------------------
		this.censusPanel = new com.nuclearunicorn.game.ui.CensusPanel($I("village.panel.census"), this.game.village, this.game);
		//this.censusPanel.collapsed = true;
		if (!this.game.science.get("civil").researched){
			this.censusPanel.setVisible(false);
		}

		this.censusPanelContainer = this.censusPanel.render(tabContainer);

		this.update();
	},

	update: function(){
		this.inherited(arguments);

		if (this.tdTop){
			this.tdTop.innerHTML = $I("village.general.free.kittens.label") + ": " + this.game.village.getFreeKittens() + " / " + this.game.resPool.get("kittens").value;
		}

		if (this.happinessStats){
			var happiness = this.game.village.happiness * 100;
			var happinessVal = happiness < 10000 ? Math.floor(happiness) : this.game.getDisplayValueExt(happiness);
			this.happinessStats.innerHTML = $I("village.census.lbl.happiness") + ":  " + happinessVal + "%";
		}

		var festivalDays = this.game.calendar.festivalDays;
		if (festivalDays){
			this.happinessStats.innerHTML += "<br><br> " + $I("village.census.lbl.festival.duration") + " " + this.game.toDisplayDays(festivalDays);
		}

		if (this.statisticsPanel){
			this.statisticsPanel.setVisible(
				this.game.village.getKittens() >= 5 || this.game.resPool.get("zebras").value > 0
			);
		}
		if (this.huntBtn){
			this.huntBtn.update();
		}
		if (this.festivalBtn){
			this.festivalBtn.update();
		}

		//update kitten stats

		if (this.censusPanel){
			var hasCivilService = this.game.science.get("civil").researched;
			this.censusPanel.setVisible(hasCivilService);

			this.censusPanel.update();
		}
		if (this.game.ironWill && !this.game.village.getKittens()){
			this.jobsPanel.setVisible(false);
		}else{
			this.jobsPanel.setVisible(true);
		}


		//this.updateCensus();
		this.updateTab();
	},

	updateTab: function(){
		this.tabName = this.getVillageTitle();
		var freeKittens = this.game.village.getFreeKittens();
		if (freeKittens > 0) {
			this.tabName += " <span class='genericWarning'>(" + this.game.getDisplayValueExt(freeKittens, false, false, 0) + ")</span>";
		}
		if (this.domNode) {
			this.domNode.innerHTML = this.tabName;
		}
	},

	getVillageTitle: function(){
		var kittens = this.game.village.getKittens();
		switch (true) {
			//you gotta be kitten me
		case kittens > 10000:
			return $I("village.tab.title.deities");
		case kittens > 5000:
			return $I("village.tab.title.elders");
		case kittens > 2000:
			return $I("village.tab.title.union");
		case kittens > 1500:
			return $I("village.tab.title.council");
		case kittens > 1200:
			return $I("village.tab.title.consortium");
        case kittens > 1000:
            return $I("village.tab.title.civilisation");	//all rights reserved, yada yada.
        case kittens > 900:
            return $I("village.tab.title.society");
        case kittens > 800:
            return $I("village.tab.title.reich");
        case kittens > 700:
            return $I("village.tab.title.federation");
        case kittens > 600:
            return $I("village.tab.title.hegemony");
		case kittens > 500:
			return $I("village.tab.title.dominion");
		case kittens > 400:
			return $I("village.tab.title.imperium");
		case kittens > 300:
			return $I("village.tab.title.empire");
		case kittens > 250:
			return $I("village.tab.title.megapolis");
		case kittens > 200:
			return $I("village.tab.title.metropolis");
		case kittens > 150:
			return $I("village.tab.title.city");
		case kittens > 100:
			return $I("village.tab.title.town");
		case kittens > 50:
			return $I("village.tab.title.smalltown");
		case kittens > 30:
			return $I("village.tab.title.settlement");
		case kittens > 15:
			return $I("village.tab.title.village");
		case kittens > 0:
			return $I("village.tab.title.smallvillage");
		default:
			return $I("village.tab.title.outpost");
		}
	},

	skillToText: function(value){
		switch (true) {
		case value < 100:
			return $I("village.skill.dabbling");
		case value < 500:
			return $I("village.skill.novice");
		case value < 1200:
			return $I("village.skill.adequate");
		case value < 2500:
			return $I("village.skill.competent");
		case value < 5000:
			return $I("village.skill.skilled");
		case value < 9000:
			return $I("village.skill.proficient");
		default:
			return $I("village.skill.master");
		}
	},

	sendHunterSquad: function(){
		this.game.village.sendHunters();
	},

	holdFestival: function(amt){
		this.game.village.holdFestival(amt);
	},

	rand: function(ratio){
		return (Math.floor(Math.random() * ratio));
	}
});
