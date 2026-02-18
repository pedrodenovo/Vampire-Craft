import { world , system} from '@minecraft/server';

// By thini
// Valeu meu mano... Y love you man!

system.beforeEvents.startup.subscribe((data) => {
    data.blockComponentRegistry.registerCustomComponent('thini:crop', {
        onPlayerInteract: ((onPlayerInteract) => {
            const { block, player } = onPlayerInteract;
            const { x, y, z } = block.location;
            const growth = block.permutation.getState('thini:growth_stage');
            const equipment = player.getComponent('equippable').getEquipment('Mainhand');
            const random = Math.floor(Math.random() * 100) < 80;

            if (equipment == undefined) return;

            if (growth < 3 && equipment.typeId == 'minecraft:bone_meal') {
                player.runCommand('clear @s[m=s] bone_meal 0 1');
                block.dimension.runCommand(`execute positioned ${x} ${y + 0.5} ${z} run function sunrise/particle_sound`);
                if (random == true) {
                    block.setPermutation(block.permutation.withState('thini:growth_stage', growth + 1));
                };
            };
        }),

        onRandomTick: ((onRandomTick) => {
            const { block } = onRandomTick;
            const random = Math.floor(Math.random() * 100) < 60;
            const growth = block.permutation.getState('thini:growth_stage');

            if (growth < 3 && random == true) {
                block.setPermutation(block.permutation.withState('thini:growth_stage', growth + 1));
            };
        })
    });
});