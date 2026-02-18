import { world, system } from "@minecraft/server";

// ==========================================
// 1. CONFIGURAÇÕES GERAIS
// ==========================================
const MANA_MAX = 100; // 100 pontos = 10 quadrados (10 pontos por quadrado)
const MANA_REGEN_TICK = 2; // Recupera 2 de mana a cada 10 ticks (meio segundo)
const PASSIVE_TICK_RATE = 10; 

// Itens que ativam a Action Bar e o ciclo de magias
const SKILL_CASTERS = [
    "sunrise:vampire_amulet",
    "sunrise:vampire_dagger",
    "sunrise:werewolf_claws",
    "sunrise:witcher_grimoire",
    "sunrise:witcher_silver_sword"
];

const sneakStateCache = new Map();
let loopCounter = 0; // Controle interno de ticks para otimização de performance

// ==========================================
// 2. FUNÇÕES DE MANA
// ==========================================

function getPlayerMana(player) {
    let mana = player.getDynamicProperty("sunrise:mana");
    if (mana === undefined) {
        mana = MANA_MAX;
        player.setDynamicProperty("sunrise:mana", mana);
    }
    return mana;
}

function setPlayerMana(player, amount) {
    const newMana = Math.max(0, Math.min(amount, MANA_MAX));
    player.setDynamicProperty("sunrise:mana", newMana);
}

// Exportada para ser usada nos arquivos de execução de habilidades (item_events.js)
export function consumeMana(player, cost) {
    const currentMana = getPlayerMana(player);
    if (currentMana >= cost) {
        setPlayerMana(player, currentMana - cost);
        return true;
    }
    return false;
}

function renderManaBar(currentMana) {
    const squares = Math.floor(currentMana / 10);
    const filled = "§b" + "■".repeat(squares);
    const empty = "§7" + "□".repeat(10 - squares);
    return filled + empty;
}

// ==========================================
// 3. CONTROLE DE HABILIDADES (SNEAK-CYCLE)
// ==========================================

// Simulação: Esta função futuramente lerá as tags para retornar apenas skills compradas
function getUnlockedSkills(player, itemTypeId) {
    if (itemTypeId === "sunrise:witcher_grimoire") {
        return [
            { id: "frost_shot", name: "Disparo Gélido", cost: 30 },
            { id: "meteor", name: "Impacto de Meteoro", cost: 80 }
        ];
    }
    if (itemTypeId === "sunrise:werewolf_claws") {
         return [
            { id: "devastating_jump", name: "Pulo Devastador", cost: 40 },
            { id: "howl", name: "Uivo Aterrorizante", cost: 50 }
        ];
    }
    if (itemTypeId === "sunrise:vampire_amulet") {
        return [
           { id: "dark_transfusion", name: "Transfusão Sombria", cost: 40 },
           { id: "fascination", name: "Fascinação", cost: 60 }
       ];
   }
   if (itemTypeId === "sunrise:vampire_dagger") {
        return [
           { id: "bat_swarm", name: "Enxame de Morcegos", cost: 25 },
           { id: "leech_strike", name: "Golpe Sanguessuga", cost: 15 }
       ];
   }
    return [];
}

export function getActiveSkill(player, itemTypeId) {
    const skills = getUnlockedSkills(player, itemTypeId);
    if (skills.length === 0) return null;

    const index = player.getDynamicProperty(`sunrise:skill_index_${itemTypeId}`) || 0;
    return skills[index % skills.length];
}

function cycleActiveSkill(player, itemTypeId) {
    const skills = getUnlockedSkills(player, itemTypeId);
    if (skills.length <= 1) return;

    let currentIndex = player.getDynamicProperty(`sunrise:skill_index_${itemTypeId}`) || 0;
    currentIndex = (currentIndex + 1) % skills.length;
    player.setDynamicProperty(`sunrise:skill_index_${itemTypeId}`, currentIndex);
    
    player.playSound("random.pop", { volume: 0.5, pitch: 2.0 });
}

// ==========================================
// 4. LÓGICA DE DANO SOLAR (VAMPIRO)
// ==========================================

function isExposedToSun(player) {
    if (player.dimension.id !== "minecraft:overworld") return false;

    // Tempo diurno: entre 0 e 13000 ticks
    const time = world.getTimeOfDay();
    if (time > 13000 && time < 23000) return false;

    if (player.isInWater) return false;

    const headLoc = { x: player.location.x, y: player.location.y + 1.8, z: player.location.z };
    
    if (headLoc.y >= 320) return true; 

    const rayHit = player.dimension.getBlockFromRay(headLoc, { x: 0, y: 1, z: 0 }, { 
        maxDistance: 320 - headLoc.y,
        includeLiquidBlocks: true, 
        includePassableBlocks: false 
    });

    return rayHit === undefined;
}

// ==========================================
// 5. LOOP PRINCIPAL (RODA A CADA 10 TICKS / 0.5s)
// ==========================================

system.runInterval(() => {
    loopCounter++;
    const isOneSecondMark = (loopCounter % 2 === 0);

    for (const player of world.getPlayers()) {
        
        // --- A. REGENERAÇÃO DE MANA ---
        const currentMana = getPlayerMana(player);
        if (currentMana < MANA_MAX) {
            setPlayerMana(player, currentMana + MANA_REGEN_TICK);
        }

        // --- B. EFEITOS PASSIVOS SEGUROS ---
        if (player.hasTag("passive_night_vision")) {
            player.addEffect("night_vision", 30, { amplifier: 0, showParticles: false }); 
        }
        if (player.hasTag("passive_speed_1")) {
            player.addEffect("speed", 30, { amplifier: 0, showParticles: false });
        }
        if (player.hasTag("passive_jump_1")) {
            player.addEffect("jump_boost", 30, { amplifier: 0, showParticles: false });
        }

        // --- C. DANO SOLAR (Roda a cada 20 ticks / 1s) ---
        if (isOneSecondMark) {
            if (player.hasTag("vampire") && !player.hasTag("sun_walker")) {
                if (isExposedToSun(player)) {
                    const equipment = player.getComponent("equippable");
                    const helmet = equipment.getEquipment("Head");

                    if (!helmet) {
                        // Aplica fogo por 2 segundos. O loop renova a cada 1 segundo.
                        player.setOnFire(2); 
                    }
                }
            }
        }

        // --- D. CONTROLE DE UI E INPUT ---
        const inventory = player.getComponent("inventory");
        if (!inventory) continue;

        const container = inventory.container;
        const selectedSlot = player.selectedSlotIndex;
        const heldItem = container.getItem(selectedSlot);

        if (heldItem && SKILL_CASTERS.includes(heldItem.typeId)) {
            const itemTypeId = heldItem.typeId;
            
            const isCurrentlySneaking = player.isSneaking;
            const wasSneaking = sneakStateCache.get(player.id) || false;

            if (isCurrentlySneaking && !wasSneaking) {
                cycleActiveSkill(player, itemTypeId);
            }
            sneakStateCache.set(player.id, isCurrentlySneaking);

            const activeSkill = getActiveSkill(player, itemTypeId);
            const manaBarString = renderManaBar(currentMana);

            if (activeSkill) {
                player.onScreenDisplay.setActionBar(`§e[ §f${activeSkill.name} §e]§r\n${manaBarString}`);
            } else {
                player.onScreenDisplay.setActionBar(`§7Nenhuma habilidade\n${manaBarString}`);
            }

        } else {
            sneakStateCache.set(player.id, false);
        }
    }
}, PASSIVE_TICK_RATE);
