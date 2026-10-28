// Haberlerin İngilizcesi (kimliğe göre). Türkçeleri news.ts'te; yeni haber eklenince buraya da yaz (yoksa İngilizcede
// Türkçe görünür). Görseller ve tarih Türkçe kayıttan gelir; captions görsellerle aynı sırada.

import type { NewsSection } from './news';
import { SOUND_CREDITS } from '../audio/credits';

export interface NewsText {
  title: string;
  summary: string;
  captions?: string[];
  sections: NewsSection[];
}

export const NEWS_EN: Record<string, NewsText> = {
  ingilizce: {
    title: 'Now in English',
    summary: 'Switch the whole game between English and Turkish with one tap on the EN | TR button in the main menu.',
    captions: ['The EN | TR button at the top right of the main menu: the dark side shows the current language.'],
    sections: [
      {
        text: [
          'WarSimBox can now be played in English. Tap the EN | TR button at the top right of the main menu once: the dark side slides across, a small plane towing a banner flies past, and the game opens in the new language.',
        ],
      },
      {
        heading: 'What is translated',
        bullets: [
          'Menus, panels, the mission planner, the research tree, the market, building and settings.',
          'Aircraft descriptions, hangar data, scenarios, maps and the news.',
          'The event log and the lines that tell you what each aircraft is doing (“Defensive: break turn” and so on).',
          'Numbers and units follow the language: 40%, 7.7 mm and 25,000 kr in English.',
        ],
      },
      {
        heading: 'Good to know',
        bullets: [
          'On first launch the game uses your browser\'s language; your choice is remembered on this device.',
          'The language can only be changed from the main menu. To switch during a game, save first, then return to the main menu.',
          'In older saves, building names and past events stay in the language they were saved in; a new campaign starts in the language you chose.',
        ],
      },
      {
        heading: 'Also',
        bullets: ['On laptop screens (1280–1600 px) the top bar no longer overflows and button labels no longer break onto two lines.'],
      },
    ],
  },
  sesler: {
    title: 'Sounds are here',
    summary: 'Real recordings: warplane engines, machine guns and cannon, flak, explosions and an air raid siren.',
    sections: [
      {
        text: [
          'WarSimBox now has sound, and every sound is a real recording: warplanes at air shows, firing ranges, artillery and a real air raid siren. Zoom in and you are in the middle of the fight; zoom out and the battle sounds distant, muffled and echoing, and the map goes quiet in the strategy view. Important events are heard wherever the camera is.',
        ],
      },
      {
        heading: 'Aircraft',
        bullets: [
          'Inline engines sound like the Bf 109E\'s Daimler-Benz DB 601, radials like the Fw 190A\'s BMW 801, multi-engine types like a four-engine piston aircraft, and jets like the J79 turbojet; revs follow the throttle and the pitch shifts with Doppler.',
          'When an aircraft passes close by, a real flyby recording for its type plays: Spitfire, Bf 109, P-47, Fw 190, Lancaster, jet.',
          'The Ju 87 B\'s siren wails as it dives, rising in pitch as it speeds up.',
        ],
      },
      {
        heading: 'Guns and explosions',
        bullets: [
          'Guns sound by calibre and number of barrels: rifle-calibre machine guns from a WWII Maxim, 12.7 mm from .50 BMG shots, 20 mm from a Lahti L-39; shots line up at the real rate of fire and the echo follows the end of a burst.',
          'Flak has the 37–40 mm "pom-pom" and the heavy 88–128 mm guns, with shrapnel bursting in the air.',
          'Near and distant bomb explosions sound different; a distant explosion is heard a little after its flash.',
        ],
      },
      {
        heading: 'Alerts',
        bullets: [
          'An air raid siren sounds when enemy aircraft approach your territory, and a hand-cranked fire bell when one of your buildings is hit.',
          'Research reports arrive with a typewriter bell and mission reports in Morse over the radio; victory brings a cavalry charge bugle, defeat "Taps".',
        ],
      },
      {
        heading: 'Settings',
        bullets: [
          'The speaker at the top right (or the N key) mutes and unmutes the sound.',
          'Settings → Sound: master, battle sounds, alerts and interface each have their own volume.',
          'No sound on your phone? Check the phone\'s silent switch.',
        ],
      },
      {
        heading: 'Sound recordings',
        text: ['The recordings come from Freesound.org; all are open for commercial use (CC0 or CC BY). Thanks to the recordists:'],
        links: SOUND_CREDITS.map((c) => ({ text: `${c.title.replace(/\.(wav|mp3|flac|aif|ogg)$/i, '')} — ${c.user} (${c.license})`, href: c.url })),
      },
    ],
  },
  'telefonda-oyna': {
    title: 'Play on your phone',
    summary: 'A layout for phones in landscape, touch camera controls, news and feedback.',
    sections: [
      {
        text: [
          'WarSimBox now plays on phones too. Turn your phone sideways: the top bar switches to a compact layout, the side panels start closed and the right panel opens when you select something.',
        ],
      },
      {
        heading: 'Touch',
        bullets: [
          'One finger pans the map; two fingers zoom, rotate when you twist them, and tilt when you slide them up or down together.',
          'Tap: select · double tap: follow an aircraft · long press: cancel.',
          'When building, a tap shows where the building will go; place it with the “Rotate”, “Place” and “Cancel” buttons at the bottom.',
          'Choose “Add to Home Screen” in your browser and the game opens without browser bars.',
        ],
      },
      {
        heading: 'New in the main menu',
        bullets: [
          'News at the top left: update notes and pictures.',
          'Feedback on the right: write what you think and fill in “I would pay … $ for this game on Steam”; no account needed.',
          'On a computer the game goes fullscreen when it starts; the ⛶ button toggles fullscreen.',
        ],
      },
    ],
  },
  'son-kalan-kazanir': {
    title: 'Last one standing wins',
    summary: 'The campaign now has an end: elimination, victory and repairs.',
    captions: ['Just select the damaged building and press “Repair”.'],
    sections: [
      {
        text: [
          'The campaign now ends when only one nation is left on the map. A nation that loses all its airbases has 5 minutes to start building a new one; if it cannot, it is eliminated, its remaining buildings are abandoned and its aircraft in the air land in neutral countries.',
          'When your last airbase falls, a countdown appears at the top of the screen. When you are eliminated or win, a campaign summary opens; you can stay on the map and keep watching if you like.',
        ],
      },
      {
        heading: 'Repairs',
        text: [
          'Damaged buildings can now be repaired. Select one and press “Repair”: repairs are slow and paid for step by step. A building that is hit waits 10 minutes before repairs resume; damage between raids is undone, but a siege in progress is not wiped away.',
        ],
      },
      {
        heading: 'A faster game',
        bullets: [
          'Aircraft, buildings, base facilities, flak and research all cost 30% less.',
          'Airbase strength went down from 3,000 to 1,600; a single bomb still cannot destroy one.',
          'Destroying a main base takes about half as long as in the previous version.',
        ],
      },
    ],
  },
  'rakip-komutanlar': {
    title: 'Smarter rival commanders',
    summary: 'Bots now budget, expand and attack according to a plan.',
    captions: ['Over time, bots build their second and third airbases.'],
    sections: [
      {
        text: [
          'Rival nations now split their money: one share for new mines and bases, one for the air force and defences, the rest for research. They used to stop research and production altogether while saving up for mines.',
        ],
      },
      {
        heading: 'Defence and placement',
        bullets: [
          'Flak batteries are placed right next to what they protect: the runway, the factory and the mines.',
          'Batteries can now be built just outside an airbase\'s fence; that goes for you too.',
          'Mines and radars are built on the side facing away from the enemy.',
        ],
      },
      {
        heading: 'Expansion',
        text: [
          'Over time, bots build second and third airbases, add factories to the new bases and spread their aircraft across them. A bot whose main base falls fights on from its other bases.',
        ],
      },
      {
        heading: 'Plan of attack',
        text: [
          'Each bot picks a target nation: first it strikes the surroundings (flak, radar, factory, mines), then it goes for the main base. Bots try not to all gang up on the same nation.',
          'Alert interceptors take off at least in pairs, in fours against a big formation; they go for bombers first and do not chase enemies far beyond the defended zone.',
        ],
      },
    ],
  },
  'ucaksavar-dalas': {
    title: 'Flak and dogfight AI',
    summary: 'Realistic flak, evasive manoeuvres and smarter fighters.',
    captions: ['A low-level dogfight: Spitfires and a Bf 109 F breaking up in mid-air.'],
    sections: [
      {
        heading: 'Flak',
        bullets: [
          'Guns are limited by how fast they can traverse: heavy guns cannot follow an aircraft passing low and fast.',
          'Heavy guns fire at where the target is going; rangefinder, predictor and radar research improve accuracy.',
          'Aircraft avoid flak zones and change heading and altitude under fire.',
        ],
      },
      {
        heading: 'Fighters',
        bullets: [
          'Fighters attack a defended bomber box from the front instead of crawling up from behind.',
          'Fast fighters escape a better-turning opponent down low by weaving to open the speed gap, not by turning.',
          'Escorts fly S-turns beside the flight they protect to keep their speed up.',
        ],
      },
      {
        heading: 'Gunners',
        text: ['Bomber gunners fire with realistic accuracy; powered turrets track better than hand-held guns.'],
      },
    ],
  },
  'gorev-dagilimi': {
    title: 'Task split in the mission planner',
    summary: 'Split your flights in two and see the odds based on your load.',
    sections: [
      {
        text: [
          'You can split one aircraft type between two jobs: on patrol, some go for escort fighters and some for bombers; in dive bombing and ground attack, some first suppress the flak around the target.',
        ],
      },
      {
        bullets: [
          'The success estimate works out whether your load is enough to destroy the target (“Expected damage ≈21%, needed 12%”).',
          'If the flight a close escort protects goes down, it switches to protecting another flight in the package.',
          'The Active missions panel shows each flight\'s task.',
        ],
      },
    ],
  },
  'yeni-ucaklar': {
    title: 'Mission results and 16 new aircraft',
    summary: 'Missions end in success, failure or no result; rewards only for success.',
    sections: [
      {
        text: [
          'Every mission now ends according to what actually happened in the air. Rewards are paid only for successful missions; the planner shows an estimated chance of success. Research raises the odds, but no mission is ever certain.',
        ],
      },
      {
        heading: 'New aircraft',
        text: [
          'The I-16, A6M2 Zero, Blenheim, P-40E, Pe-2, Yak-3, La-7, P-38J, F6F-5 Hellcat, Lancaster, Mosquito, He 162, F-80C, Vampire, Ar 234 and Il-28 joined the research tree.',
        ],
      },
    ],
  },
  'yeni-haritalar': {
    title: 'Two new 300 km maps',
    summary: 'Mainland and Archipelago: battlefields four times larger.',
    sections: [
      {
        text: [
          'The maps grew to 300 × 300 km. Mainland is a wide country split by mountains and a gulf; Archipelago is six islands and a neutral volcanic island in the middle. Pick your map and the number of enemies (1–5) in the main menu.',
        ],
      },
      {
        bullets: [
          'Dive bombing aim was fixed: most bombs now land within 60 m of the target.',
          'High-flying jet bombers release their bombs at the right distance.',
        ],
      },
    ],
  },
  'ana-menu': {
    title: 'Main menu, accounts and saves',
    summary: 'Log in with your name, save your game and continue where you left off.',
    sections: [
      {
        text: [
          'The game now opens with a main menu, while rival nations fight each other in the background. Log in at the top right with just a name; come back with the same name and your saves are waiting.',
        ],
      },
      {
        bullets: [
          'Esc opens the pause menu: resume, save, saves and display settings.',
          'While the game runs, it autosaves every 5 minutes.',
          'Guest games are not saved.',
        ],
      },
    ],
  },
  ekonomi: {
    title: 'Economy: money, mines and the market',
    summary: 'Everything has a price; income comes from mines and from the war.',
    sections: [
      {
        text: [
          'Building aircraft, putting up buildings and doing research all cost money. Income comes from four places: mines, enemy aircraft shot down, enemy buildings destroyed and aircraft sold to neutral countries.',
        ],
      },
      {
        bullets: [
          'Mine yield varies a lot from place to place and is not shown on the map; you only find out by building.',
          'Sweden, Switzerland, Spain, Portugal, Argentina and Türkiye sell aircraft on the market.',
          'The treasury chip in the top bar shows your balance and ledger.',
        ],
      },
    ],
  },
  'gercek-ucaklar': {
    title: 'Real aircraft, real physics',
    summary: 'Aircraft that fly by real data, with a detailed damage model.',
    sections: [
      {
        text: [
          'Every aircraft is defined by its real mass, wing area, engine power and weapons; the atmosphere, Mach effects, propeller and jet thrust are all calculated.',
        ],
      },
      {
        bullets: [
          'Component damage: engines, fuel, controls, fire and explosions.',
          'The crew of a falling aircraft can bail out; those who land in friendly territory return.',
          'Free loadouts: bombs, rockets or fuel tanks per hardpoint.',
        ],
      },
    ],
  },
};
