import { world, system } from "@minecraft/server";
import { getActiveSkill, consumeMana } from "./skill_manager.js";

// ==========================================
// 1. CONFIGURAÇÃO DE COOLDOWNS (em Milissegundos)
// ==========================================
const SKILL_COOLDOWNS = {
    "bat_swarm": 5000,
    "leech_strike": 0, // Controlado pela velocidade de ataque do jogador
    "dark_transfusion": 8000,
    "fascination": 15000,
    "devastating_jump": 10000,
    "howl": 20000,
    "frost_shot": 4000,
    "meteor": 15000,
    "aard_sign": 8000,
    "alchemical_blade": 25000
};

const SKILL_CASTERS = [
    "sunrise:vampire_amulet", 
    "sunrise:vampire_dagger",
    "sunrise:werewolf_claws", 
    "sunrise:witcher_grimoire",
    "sunrise:witcher_silver_sword"
];

// ==========================================
// 2. DISPARO DE HABILIDADES ATIVAS (Clique Direito / Use)
// ==========================================

world.afterEvents.itemUse.subscribe((ev) => {
    const { source: player, itemStack } = ev;

    if (!SKILL_CASTERS.includes(itemStack.typeId)) return;

    const activeSkill = getActiveSkill(player, itemStack.typeId);
    if (!activeSkill) return;

    if (activeSkill.id === "leech_strike") return; // Ativada apenas no hit

    const now = Date.now();
    const lastUsed = player.getDynamicProperty(`cd_${activeSkill.id}`) || 0;
    const cooldownMs = SKILL_COOLDOWNS[activeSkill.id] || 1000;

    if (now < lastUsed + cooldownMs) {
        const remaining = ((lastUsed + cooldownMs - now) / 1000).toFixed(1);
        player.onScreenDisplay.setActionBar(`§cEm recarga: ${remaining}s`);
        player.playSound("note.bass", { volume: 1.0 });
        return;
    }

    if (!consumeMana(player, activeSkill.cost)) {
        player.onScreenDisplay.setActionBar(`§cMana / Energia insuficiente!`);
        player.playSound("note.bass", { volume: 1.0 });
        return;
    }

    player.setDynamicProperty(`cd_${activeSkill.id}`, now);
    
    const cooldownComp = itemStack.getComponent("cooldown");
    if (cooldownComp) cooldownComp.startCooldown(player);

    executeActiveSkill(player, activeSkill.id);
});

// ==========================================
// 3. DISPARO DE HABILIDADES FÍSICAS (Clique Esquerdo / Hit)
// ==========================================

world.afterEvents.entityHitEntity.subscribe((ev) => {
    const { damagingEntity: player, hitEntity: target } = ev;
    
    if (player.typeId !== "minecraft:player") return;

    const inventory = player.getComponent("inventory");
    if (!inventory) return;
    
    const heldItem = inventory.container.getItem(player.selectedSlotIndex);
    if (!heldItem) return;

    const activeSkill = getActiveSkill(player, heldItem.typeId);

    // A. Golpe Sanguessuga (Vampiro)
    if (activeSkill && activeSkill.id === "leech_strike" && heldItem.typeId === "sunrise:vampire_dagger") {
        if (consumeMana(player, activeSkill.cost)) {
            const healthComp = player.getComponent("health");
            const newHealth = Math.min(healthComp.currentValue + 2, healthComp.effectiveMax);
            healthComp.setCurrentValue(newHealth);
            
            player.playSound("random.drink", { volume: 0.5, pitch: 1.5 });
            target.dimension.spawnParticle("minecraft:heart_particle", target.location);
        }
    }

    // B. Lâmina Alquímica (Bruxo)
    const alchemicalCharges = player.getDynamicProperty("sunrise:alchemical_charges") || 0;
    if (alchemicalCharges > 0) {
        target.addEffect("fatal_poison", 100, { amplifier: 1 });
        target.dimension.spawnParticle("minecraft:crop_growth_emitter", target.location);
        
        const newCharges = alchemicalCharges - 1;
        player.setDynamicProperty("sunrise:alchemical_charges", newCharges);
        
        if (newCharges === 0) {
            player.onScreenDisplay.setActionBar("§cVeneno esgotado.");
        } else {
            player.onScreenDisplay.setActionBar(`§aVeneno restante: ${newCharges} hits`);
        }
    }
});

// ==========================================
// 4. EVENTOS REATIVOS (Defesa e Controle de Dano)
// ==========================================

world.beforeEvents.entityHurt.subscribe((ev) => {
    const { hurtEntity: player, damageSource } = ev;
    
    if (player.typeId !== "minecraft:player") return;

    // A. Anulação de Dano de Queda (Pulo do Lobisomem)
    if (damageSource.cause === "fall" && player.hasTag("immune_to_fall")) {
        ev.cancel = true; // Cancela o dano nativamente
        player.removeTag("immune_to_fall"); // Remove a tag imediatamente para evitar abuso
        
        // Efeito em área ao cair
        player.dimension.spawnParticle("minecraft:large_explosion", player.location);
        player.playSound("random.explode", { volume: 0.8, pitch: 0.5 });
        return;
    }
});

world.afterEvents.entityHurt.subscribe((ev) => {
    const { hurtEntity: player, damageSource } = ev;
    
    if (player.typeId !== "minecraft:player" || !player.hasTag("witcher")) return;

    // B. Escudo Estático (Bruxo)
    if (player.hasTag("static_shield") && damageSource.damagingEntity) {
        const attacker = damageSource.damagingEntity;
        
        if (attacker.typeId !== "minecraft:player" && damageSource.cause === "entityAttack") {
            attacker.applyDamage(4, { cause: "lightning" });
            player.dimension.spawnParticle("minecraft:lightning_particle", attacker.location);
            player.playSound("random.spark", { volume: 1.0 });
        }
    }
});

// ==========================================
// 5. LÓGICA MATEMÁTICA DAS MAGIAS
// ==========================================

function executeActiveSkill(player, skillId) {
    const viewDir = player.getViewDirection();
    const headLoc = { x: player.location.x, y: player.location.y + 1.6, z: player.location.z };

    switch (skillId) {
        case "bat_swarm": {
            const blockHit = player.dimension.getBlockFromRay(headLoc, viewDir, { maxDistance: 8 });
            const finalLoc = blockHit ? blockHit.block.location : {
                x: player.location.x + (viewDir.x * 8),
                y: player.location.y + (viewDir.y * 8),
                z: player.location.z + (viewDir.z * 8)
            };
            player.teleport(finalLoc);
            player.playSound("mob.bat.takeoff", { volume: 1.0 });
            player.dimension.spawnParticle("minecraft:large_smoke", finalLoc);
            break;
        }

        case "meteor": {
            const rayHit = player.dimension.getBlockFromRay(headLoc, viewDir, { maxDistance: 30 });
            if (rayHit) {
                player.dimension.createExplosion(rayHit.block.location, 4, { 
                    causesFire: true, 
                    breaksBlocks: false, 
                    source: player 
                });
            } else {
                player.sendMessage("§cAlvo muito distante.");
            }
            break;
        }

        case "howl": {
            const entities = player.dimension.getEntities({
                location: player.location,
                maxDistance: 15,
                excludeFamilies: ["player", "wolf"]
            });
            for (const entity of entities) {
                entity.addEffect("weakness", 200, { amplifier: 1 });
                entity.addEffect("slowness", 200, { amplifier: 1 });
            }
            player.playSound("mob.wolf.howl", { volume: 2.0 });
            break;
        }
            
        case "dark_transfusion": {
            const health = player.getComponent("health");
            if (health.currentValue > 4) {
                health.setCurrentValue(health.currentValue - 4);
                // NOTA: Requer o projétil "sunrise:blood_projectile" no Behavior Pack
                try {
                    const proj = player.dimension.spawnEntity("sunrise:blood_projectile", headLoc);
                    const projComp = proj.getComponent("projectile");
                    if (projComp) projComp.shoot(viewDir);
                } catch (e) {
                    player.sendMessage("§c[Erro Técnico] Entidade do projétil não existe no BP ainda.");
                }
                player.playSound("mob.wither.shoot", { pitch: 2.0 });
            } else {
                player.sendMessage("§cVida insuficiente para o sacrifício!");
            }
            break;
        }

        case "devastating_jump": {
            player.applyKnockback(viewDir.x, viewDir.z, 2.5, 1.5);
            player.addTag("immune_to_fall"); // Removida no evento entityHurt
            player.playSound("mob.enderdragon.flap", { volume: 2.0 });
            break;
        }

        case "aard_sign": {
            const aardEntities = player.dimension.getEntities({
                location: player.location,
                maxDistance: 6,
                excludeFamilies: ["player"] 
            });
            for (const entity of aardEntities) {
                const dx = entity.location.x - player.location.x;
                const dz = entity.location.z - player.location.z;
                const magnitude = Math.sqrt(dx * dx + dz * dz);
                if (magnitude > 0) {
                    entity.applyKnockback(dx / magnitude, dz / magnitude, 3.0, 0.5);
                }
            }
            player.playSound("random.explode", { volume: 0.5, pitch: 2.0 });
            player.dimension.spawnParticle("minecraft:knockback_roar_particle", headLoc);
            break;
        }

        case "alchemical_blade": {
            player.setDynamicProperty("sunrise:alchemical_charges", 3);
            player.sendMessage("§aLâmina embebida em veneno! (3 cargas)");
            player.playSound("random.fizz", { volume: 1.0 });
            break;
        }

        case "frost_shot": {
            // Disparo Gélido usando Raycast instantâneo para entidades
            const hitEntities = player.dimension.getEntitiesFromRay(headLoc, viewDir, { maxDistance: 20 });
            if (hitEntities.length > 0) {
                // Pega a primeira entidade atingida que não seja o próprio jogador
                const targetInfo = hitEntities.find(e => e.entity.id !== player.id);
                if (targetInfo) {
                    // Slowness amplifier 255 congela a entidade no lugar
                    targetInfo.entity.addEffect("slowness", 60, { amplifier: 255 });
                    targetInfo.entity.dimension.spawnParticle("minecraft:ice_evaporation_emitter", targetInfo.entity.location);
                    player.playSound("random.glass", { volume: 1.0 });
                }
            }
            break;
        }

        case "fascination": {
            const coneEntities = player.dimension.getEntities({
                location: player.location,
                maxDistance: 8,
                excludeFamilies: ["player"]
            });
            for (const entity of coneEntities) {
                const dx = entity.location.x - player.location.x;
                const dz = entity.location.z - player.location.z;
                const magnitude = Math.sqrt(dx * dx + dz * dz);
                
                if (magnitude > 0) {
                    // Normaliza o vetor da entidade
                    const nX = dx / magnitude;
                    const nZ = dz / magnitude;
                    // Normaliza o vetor de visão do jogador (apenas no plano X/Z)
                    const vMag = Math.sqrt(viewDir.x * viewDir.x + viewDir.z * viewDir.z);
                    const vX = viewDir.x / vMag;
                    const vZ = viewDir.z / vMag;
                    
                    // Dot Product para verificar se está na frente (Cone de ~90 graus)
                    const dotProduct = (nX * vX) + (nZ * vZ);
                    if (dotProduct > 0.5) {
                        entity.addEffect("slowness", 100, { amplifier: 255 });
                        entity.addEffect("weakness", 100, { amplifier: 4 });
                        entity.dimension.spawnParticle("minecraft:heart_particle", {x: entity.location.x, y: entity.location.y + 2, z: entity.location.z});
                    }
                }
            }
            player.playSound("mob.evocation_illager.cast_spell", { volume: 1.0 });
            break;
        }
    }
}
