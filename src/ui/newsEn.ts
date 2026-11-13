// Haberlerin İngilizcesi (kimliğe göre). Türkçeleri news.ts'te; yeni haber eklenince buraya da yaz (yoksa İngilizcede
// Türkçe görünür). Tarih ve görseller Türkçe kayıttan gelir; captions görsellerle aynı sırada. Görselde yazı varsa
// İngilizcesi cover ve files ile verilir (public/news'teki dosya adı).

import { img, type NewsSection } from './newsData';
import { SOUND_CREDITS } from '../audio/credits';

export interface NewsText {
  title: string;
  summary: string;
  cover?: string;
  files?: string[];
  captions?: string[];
  sections: NewsSection[];
}

export const NEWS_EN: Record<string, NewsText> = {
  'ogretici-konular': {
    title: 'The tutorial now comes in topics',
    summary: 'Open any topic from inside the game and watch just that part. The steps now fly the camera to your own buildings and wait for you to tap.',
    cover: 'ogretici-konu-en.jpg',
    files: ['ogretici-adim-en.jpg'],
    captions: ['Money and treasury: the camera flies to your mine and you open the treasury from the left panel.'],
    sections: [
      {
        heading: 'Topic list',
        bullets: [
          'Tutorial is the leftmost button on the top bar (just a book icon on phones); it is in the pause menu too.',
          'Seven topics: map and camera, planning and launching a mission, money and treasury, building and personnel, production and anti-aircraft guns, research and hangar, enemies and war.',
          'Pick a topic and only its steps are shown, inside your current campaign. When it ends the list opens again and the topic is marked as watched.',
          'Each topic lists its steps underneath; the search box finds what you need (mine, radar, take-off…).',
          'The game pauses while the list is open and carries on at the same speed when you close it.',
        ],
      },
      {
        heading: 'More hands-on steps',
        bullets: [
          'The steps are more than text: the camera flies to your mine, factory or battery on the map, you tap it and open the matching window from the left panel.',
          'Batch production and "Repeat when done", the research tabs, cards and dossier, and going to a target from the enemy list are shown step by step too.',
          'The full tutorial in your first campaign includes these steps; you can skip any part.',
          '"Skip step" and "Close" are easier to tap on phones.',
        ],
      },
    ],
  },
  'me262-u4': {
    title: 'New aircraft: Me 262 A-1a/U4',
    summary: 'The Me 262 with a single 50 mm cannon in its nose joins the research tree: it fires on bomber formations from beyond the reach of their gunners. Both Me 262 models have also been rebuilt.',
    captions: [
      'Me 262 A-1a/U4: the 50 mm barrel sticks out about two metres beyond the nose.',
      'Me 262 A-1a: new paint and a low canopy that sits into the fuselage.',
    ],
    sections: [
      {
        heading: 'Me 262 A-1a/U4',
        bullets: [
          'A trial version of the Me 262 with a single 50 mm Mauser MK 214 A in place of the four 30 mm cannon in the nose. Two aircraft were converted and tested in the spring of 1945.',
          'The cannon fires 150 rounds a minute at a muzzle velocity of 920 m/s; the aircraft carries about 30 rounds.',
          'Every hit does heavy damage. With its slow rate of fire it is weak against fighters.',
          'Airframe and engines are those of the Me 262; the cannon and its ammunition add about 250 kg.',
          'It comes after the Me 262 in the research tree and has its own page in the encyclopedia.',
        ],
      },
      {
        heading: 'Stand-off fire',
        bullets: [
          'The U4 closes in from behind on the nearest bomber of the box and fires from beyond the reach of its gunners.',
          'It breaks away before entering their range, gets behind again and takes the next shot.',
          'Every round is heard on its own, and it leaves from the tip of the long barrel.',
        ],
      },
      {
        video: { src: img('me262.mp4'), poster: img('me262-video.jpg'), caption: 'The Me 262 and the U4 against bomber formations at dawn (in-game footage).' },
      },
      {
        heading: 'Both Me 262 models rebuilt',
        bullets: [
          'New paint: dense dark green and brown mottles over the light sides, worn paint at panel joints and leading edges.',
          'The surface no longer has the same sheen everywhere: some areas are matt, some slightly glossy, and the aircraft is a little darker. The plastic look is gone.',
          'The cockpit has been rebuilt: the canopy is lower and spreads into the fuselage, sitting as a continuation of it as on the real aircraft.',
        ],
      },
    ],
  },
  'kayit-yerleri': {
    title: 'Saves now have 4 slots',
    summary: 'Every account has 4 save slots. Autosave writes to its own slot, and you choose the slot when you save. Players with more saves have a week to tidy up.',
    cover: 'kayit-en.jpg',
    files: ['kayit-uyari-en.jpg'],
    captions: ['Accounts with too many saves see this notice every time they sign in.'],
    sections: [
      {
        heading: 'Save slots',
        bullets: [
          'Every account has 4 save slots, one save in each.',
          'Use Menu → Save and pick a slot. An empty slot saves straight away; you are asked before a full slot is overwritten.',
          'The Saves list shows the 4 slots in order, empty ones too.',
        ],
      },
      {
        heading: 'Autosave',
        bullets: [
          'The game still autosaves every 5 minutes.',
          'An autosave replaces the previous autosave of the game with the same name. If you start under a new name, it goes to slot 4 first, or to an empty slot if 4 is taken.',
          'If there is no free slot, you are told before the game starts: delete a save, or play without autosave. If a slot frees up during the game, autosave starts by itself.',
        ],
      },
      {
        heading: 'If you have more saves',
        bullets: [
          'If you had more than 4 saves before this change, a notice appears every time you sign in. Your old saves are listed in their own section in Saves.',
          'Delete the ones you don’t need. If you still have more than 4 one week after the notice, all but your newest 4 are deleted automatically, and the rest move into the slots.',
          'With 4 saves or fewer there is nothing to do: your saves have already been placed in the slots.',
        ],
      },
    ],
  },
  'ansiklopedi-hava': {
    title: 'Encyclopedia renewed: air defence, search and a steel look',
    summary: 'The encyclopedia now has pages for 10 anti-aircraft guns too. Search and sorting on the list pages, a new steel look, and more realistic aircraft finishes in the game as well.',
    cover: 'ansiklopedi2-en.jpg',
    files: ['ansiklopedi2-liste-en.jpg', 'ansiklopedi2-arama-en.jpg'],
    captions: [
      'Air defence: light, medium and heavy anti-aircraft guns.',
      'Search and sorting: type a name, short name, country or year; sort by year, name or speed.',
    ],
    sections: [
      {
        text: [
          'warsimbox.com/en/encyclopedia has been renewed: alongside the aircraft, it now covers the anti-aircraft guns too.',
        ],
      },
      {
        heading: 'Air defence section',
        bullets: [
          'From the M2 Browning to the 12.8 cm Flak 40, each of the game’s 10 anti-aircraft weapons has its own page: history, key facts and an image of the in-game model.',
          'In WarSimBox section: the gun’s in-game range, effective ceiling, practical rate of fire, the shell’s time to ceiling and how it is unlocked in research.',
          'In the hangar’s Air defence section, each gun now has a “Read its history in the encyclopedia” link.',
        ],
      },
      {
        heading: 'Search and sorting',
        bullets: [
          'A search box on the list pages: type a name, short name (bf109, p51), country, role or year.',
          'Sort aircraft by year, name or top speed, and guns by year, name or calibre.',
        ],
      },
      {
        heading: 'New look',
        bullets: [
          'The encyclopedia now has the game’s steel look: a diamond-plate top bar, metal cards and a hangar behind the aircraft.',
          'On the cards the aircraft are now closer and face right.',
          'A new scrollbar on the right that matches the theme.',
        ],
      },
      {
        heading: 'Aircraft finishes (in the game too)',
        bullets: [
          'Unpainted aircraft (P-51D, B-17G, MiG-15…) are no longer white but silver, as in reality: a sharper shine and panels in different tones.',
          'On painted aircraft the panels have faded differently and there are faint dirt streaks along the airflow; the plastic-like sheen of matte paint is gone.',
          'The Vampire FB.5 now wears the RAF camouflage of the 1950s: Dark Green and Dark Sea Grey on top, PRU Blue underneath.',
          'Landing gear fixed: on fighters like the P-51 and P-47 the gear doors no longer hang away from the leg, and on bombers such as the B-17 and Lancaster the leg now forks around the tyre instead of passing through it.',
        ],
      },
    ],
  },
  'hava-savunmasi': {
    title: 'Air defence renewed: real guns and a new research line',
    summary: 'Anti-aircraft guns are now real systems: 10 guns from the M2 to the 12.8 cm Flak 40, their own research line, factory production, gun pits at each battery and their own section in the hangar.',
    files: ['hava-yuva-en.jpg', 'hava-pano-en.jpg', 'hava-hangar-en.jpg'],
    captions: [
      'Gun pit: the gun fitted now and the guns in stock.',
      'The air defence board in research: light, medium and heavy guns, fire control, fortification and warning.',
      'Air defence in the hangar: the gun turns and fires at its real rhythm, with a range and ceiling chart beside it.',
    ],
    sections: [
      {
        heading: 'Real guns',
        bullets: [
          'Batteries now use 10 real systems: M2 Browning, 2 cm Flak 38, Oerlikon 20 mm, 2 cm Flakvierling 38, 3.7 cm Flak 36, Bofors 40 mm L/60, 8.8 cm Flak 36, 90 mm M1, 8.8 cm Flak 41 and 12.8 cm Flak 40.',
          'The Oerlikon, 90 mm M1 and Flak 41 are new. The older guns’ models were also rebuilt from photographs.',
          'Shells now slow down in flight; magazines, clips and practical rate of fire come from real data. An 8.8 cm shell takes about 20 seconds to reach 8 km, so it can miss an aircraft that changes course.',
        ],
      },
      {
        heading: 'New battery system',
        bullets: [
          'A new battery starts with 2 gun pits and 12.7 mm M2s.',
          'Research a gun and build as many as you like at a factory; finished guns go into stock.',
          'Tap a battery, pick a pit and fit a gun from stock. The removed gun returns to stock; the pit cannot fire while fitting.',
          'Upgrading raises the battery to 4 pits. Mix guns however you like.',
          'Fortification II and III no longer add pits; they reduce bomb and rocket damage by 15% and 30%.',
        ],
      },
      {
        heading: 'Research and hangar',
        bullets: [
          'Air defence is now a separate third line, progressing at the same time as aircraft programmes and engineering. Radars are on this board too.',
          'The hangar has a new Air defence section: the gun turns, raises its barrel and fires at its real rhythm. Calibre, shell, range and ceiling data are there.',
        ],
      },
      {
        heading: 'Opponents',
        bullets: [
          'Bots also fit better guns to their batteries.',
          'They do not answer every raid with the same fighters in the same numbers, and they can be caught unprepared.',
        ],
      },
      {
        heading: 'Old saves',
        bullets: [
          'Guns and extra pits in your saves are kept. Air defence research in progress moves to the new line.',
        ],
      },
    ],
  },
  'uretim-celik': {
    title: 'Production menu, steel look and a real-time counter',
    summary: 'All aircraft and guns are in one production list. Production, Research, Hangar and News have a new steel look. The game counter no longer speeds up, and menus are easier on phones.',
    cover: 'uretim-en.jpg',
    files: ['celik-arastirma-en.jpg', 'celik-hangar-en.jpg'],
    captions: [
      'The research board: the colour of the silhouette and card shows the state.',
      'The hangar: the aircraft now stands under roof trusses on a concrete floor.',
    ],
    sections: [
      {
        heading: 'Production menu',
        bullets: [
          'All aircraft and anti-aircraft guns are in one list of long rows: model, data, how many are in service and on the line, time left.',
          'Batch production: choose the number with − and +, then tap "Build". The line holds up to 30 orders.',
          'A slow flow runs across the row in production. It is hidden when visual effects are off.',
          'Types not yet researched are grey and locked; tapping one takes you to its research.',
          'The top bar has a Factory button and the U key. Tapping a factory beside a base is also easy now.',
        ],
      },
      {
        heading: 'Steel look',
        bullets: [
          'Production, Gun pit, Research, Hangar and News have moved to a heavy metal look: dark green to black from left to right, with tread plate headers.',
          'On the research board, green cards are done, bright ones can start, amber ones are in progress and grey ones are waiting for prerequisites.',
        ],
      },
      {
        heading: 'Real-time counter',
        bullets: [
          'The game time beside the clock is no longer affected by speed-ups and stops when you pause. The event log and save names show this time too.',
          'The time of day and build times still follow game speed. In old saves the counter carries on from where it was.',
        ],
      },
      {
        heading: 'Easier on phones',
        bullets: [
          'Buttons in the new windows are larger, with more room between "+" and "Build".',
          'Research no longer freezes on first opening, and the production list opens right away.',
          'While a window is open, the game behind it is drawn less often, so lists scroll smoothly.',
        ],
      },
      {
        heading: 'Tutorial',
        bullets: [
          'The tutorial now also covers the production menu, fitting guns, the three research lines and the hangar.',
        ],
      },
    ],
  },
  pervaneliler: {
    title: 'All propeller aircraft renewed',
    summary: 'All 40 propeller aircraft in the research tree were rebuilt from drawings: from the Hurricane to the B-29, each has its own fuselage, wing and landing gear. Control surfaces move and the gear folds.',
    captions: [
      'Fighters and attack aircraft: each one’s shape comes from its own drawing.',
      'Bombers: glazed noses, turrets and engine nacelles.',
    ],
    sections: [
      {
        heading: 'New models',
        bullets: [
          'All propeller aircraft were rebuilt from three-view drawings, with dimensions taken from the drawings and the aircraft’s known measurements.',
          'Each has its own details: the Stuka’s inverted gull wing and wheel spats, the Corsair’s bent wing, the P-38’s twin booms, the I-16’s open cockpit, the Zero’s long canopy, the Sea Fury’s five-blade propeller.',
          'On bombers, turrets now sit in their real places on the model, and that’s where the bullets come from.',
          'The details show best at Medium and High graphics quality. On Low the shape is the same but drawn more simply.',
        ],
      },
      {
        heading: 'Moving parts',
        bullets: [
          'Ailerons, elevators and rudders move with the aircraft’s manoeuvres, and flaps come down.',
          'The landing gear retracts after takeoff in each aircraft’s real direction: inward, outward, backward or forward. The Stuka’s gear is fixed, as it was on the real aircraft.',
          'Dive bombers open their dive brakes.',
          'Navigation lights glow red on the left wing and green on the right.',
        ],
      },
      {
        heading: 'On the ground',
        bullets: [
          'Tailwheel aircraft sit on their tails on the runway and when parked, each at an angle from its own measurements.',
          'The Hurricane Mk I’s length was corrected to 9.58 m. The encyclopedia pictures were also made from the new models.',
        ],
      },
    ],
  },
  jetler: {
    title: 'Jets rebuilt from real drawings, air bases renewed',
    summary: 'All 11 jets in the research tree were rebuilt from three-view drawings: control surfaces move and the landing gear folds into the airframe. Air bases now have open hangars and night lights.',
    captions: [
      'The 11 renewed jets: Me 262, Meteor, He 162, Ar 234, Vampire, F-80, F-84, F-86, MiG-15, Canberra and Il-28.',
      'A MiG-15 just after takeoff: the gear is folding into the airframe.',
      'A MiG-15 waiting at night in a hangar with its doors open.',
    ],
    sections: [
      {
        heading: 'The renewed jets',
        text: [
          'Me 262, Meteor F.3, He 162, Ar 234, Vampire, F-80C, F-84G, F-86F, MiG-15, Canberra and Il-28. Dimensions were read from real three-view drawings and the results compared with photographs.',
        ],
        bullets: [
          'Fuselage, canopy, air intakes and exhausts were built from scratch. Each aircraft has its own details: the Ar 234’s glazed nose, the F-84’s wingtip tanks, the Vampire’s tail booms, the Il-28’s gunner’s cabin.',
          'Ailerons, flaps, elevators and rudders move with the aircraft’s manoeuvres.',
          'The landing gear folds into the airframe after takeoff.',
          'Navigation lights glow red on the left wing and green on the right. At night the landing light lights up the ground ahead.',
          'The details show best at Medium and High graphics quality. On Low the shape is the same but drawn more simply, which keeps the frame rate up on phones.',
          'Propeller aircraft still fly with their older models for now.',
        ],
      },
      {
        heading: 'Air bases',
        bullets: [
          'Arched hangars with open doors, T2 hangars, tent hangars, blister shelters and earth revetments.',
          'Your newest aircraft stand in hangars and shelters, the rest on the apron.',
          'At dusk the runway, taxiway, apron and hangar lights come on.',
          'Runway concrete, asphalt, corrugated sheet, canvas and pierced steel planking have more detail.',
        ],
      },
    ],
  },
  eposta: {
    title: 'Email for accounts: verification, account deletion, new feedback',
    summary: 'New accounts now need a verified email address. Existing accounts don’t have to add one. You can delete your account from Profile, and your feedback now reaches us directly by email.',
    cover: 'eposta-en.jpg',
    files: ['eposta-kod-en.jpg', 'eposta-profil-en.jpg'],
    captions: [
      'Just type the 6-digit code sent from warsimbox@gmail.com.',
      'Your email address, news permission, language and account deletion are all in Profile.',
    ],
    sections: [
      {
        heading: 'When you create an account',
        bullets: [
          'You need an email address, from any email service. It’s saved once you type the 6-digit code sent from warsimbox@gmail.com.',
          'You need to accept the Privacy Policy and the KVKK Privacy Notice. Both are also linked from the main menu.',
          'One email address can have one account. In Gmail, versions with dots or a “+tag” count as the same address.',
        ],
      },
      {
        heading: 'If you already have an account',
        bullets: [
          'You’re asked for an email address when the game opens or when you log in, but it isn’t required; your saves and scores stay where they are.',
          'If you close the window, you won’t be asked again for 7 days. You can add an address from Profile at any time.',
        ],
      },
      {
        heading: 'News emails are optional',
        bullets: [
          'News emails go only to players who allow them. You can allow them when you sign up, then turn them on or off in Profile.',
          'Your account language follows the language you pick in the game and is shown in Profile. Emails arrive in that language.',
        ],
      },
      {
        heading: 'Deleting your account',
        bullets: [
          'You can delete your account yourself from Profile with your password. Your saves, scores and email address are deleted too, and this can’t be undone.',
        ],
      },
      {
        heading: 'Feedback',
        bullets: [
          'Your thoughts and suggestions now land directly in our inbox. Sending them requires an account with an email address.',
          'The “I would pay … $ for this game on Steam” part is open to everyone: without an account, your commander name is enough; with one, you aren’t asked for a name.',
        ],
      },
    ],
  },
  gorunum: {
    title: 'New look, tidier hangar, easier typing on phones',
    summary: 'The interface is simpler and the hangar is split into generation tabs. On phones, the keyboard no longer covers the field you’re typing in. News now has an unread marker too.',
    cover: 'gorunum-en.jpg',
    files: ['gorunum-tel-en.jpg'],
    captions: [
      'The main menu on a short phone screen, with the unread count on News.',
    ],
    sections: [
      {
        heading: 'Interface',
        bullets: [
          'The selected item has a light background with a fading contrail under it.',
          'In-game top bars hang from the top of the screen, and window corners are cut like a swept wing.',
          'The market is simpler: flat rows instead of boxes inside boxes.',
          'Side panel close buttons sit right next to the panel.',
        ],
      },
      {
        heading: 'Hangar',
        bullets: [
          'Aircraft are split into generation tabs, and the list no longer runs off the screen.',
          'Future jets you couldn’t fly yet were removed from the list. Every aircraft you see in the hangar is in the game.',
        ],
      },
      {
        heading: 'Phones',
        bullets: [
          'The main menu and windows now fit on short screens and when the address bar is showing.',
          'When the keyboard opens, the window moves to the top of the screen so the field you’re typing in stays visible.',
          'The keyboard no longer opens by itself with the login window; it opens when you tap a text field.',
          'On 90–144 Hz screens the game draws about 60 frames per second, so your phone runs cooler.',
          'Automatic resolution drops sooner when the game starts to stutter. Graphics on phones were set to Low once; after that your choice is kept.',
        ],
      },
      {
        heading: 'Unread news',
        bullets: [
          'When you’re logged in, a number appears on News for new items and the list says “New”. The marker goes away when you open the item, on your other devices too.',
        ],
      },
    ],
  },
  ansiklopedi: {
    title: 'Aircraft encyclopedia, faster start, real ceilings',
    summary: 'The history and data of all 51 aircraft in the game are now in the encyclopedia. The game starts much faster on phones, and fighters climb to their real ceilings.',
    captions: [
      'Every aircraft page has its history, key facts, pictures of the in-game model and its figures in the game.',
    ],
    sections: [
      {
        text: [
          'Every aircraft in the game, from the 1937 Hurricane to Korean War jets, now has its own page: warsimbox.com/en/encyclopedia.',
        ],
      },
      {
        heading: 'Aircraft encyclopedia',
        bullets: [
          'Aircraft are listed from oldest to newest. Each page has the aircraft’s history, key facts (first flight, entry into service, designer, engine, guns…) and pictures of its in-game model.',
          'The In WarSimBox section: the aircraft’s top speed, climb, turn and stall speed in the game, and how to unlock it in research.',
          'An Encyclopedia button in the main menu; in the hangar, a “Read its history in the encyclopedia” link under the aircraft’s description.',
          'In English and Turkish.',
        ],
      },
      {
        heading: 'Faster start',
        bullets: [
          'The map is now prepared on several cores of your device at once: the game starts much faster and the loading screen no longer freezes.',
          'At start-up the Mainland map is prepared at the size you picked in the menu, so a new campaign there starts without waiting.',
          'Switching to another map or size takes less time too.',
        ],
      },
      {
        heading: 'Flight fixes',
        bullets: [
          'Fighters climb to their real service ceilings: how engine power falls off with altitude is tuned for each fighter.',
          'Each aircraft’s real top speed is its speed at the altitude where it is fastest: it does not exceed it at any altitude.',
          'In jets, drag rises steeply near the speed of sound as it did in reality; the F-86 and MiG-15 are fastest down low.',
        ],
      },
    ],
  },
  'yeni-adres': {
    title: 'New address warsimbox.com: password accounts, cloud saves, scores',
    summary: 'The game has its own address now. Accounts have passwords, saves live in the cloud, and the Scores tab ranks players weekly and all time.',
    sections: [
      {
        text: [
          'WarSimBox now lives at its own address: warsimbox.com. The old address (warsimbox.vercel.app) stays open for a while, then closes.',
        ],
      },
      {
        heading: 'If you played at the old address',
        bullets: [
          'Your saves are in that browser, and the new address cannot see them on its own. To move them, open the old address and press “Set password” in the main menu.',
          'Set a password for your account: the saves in that browser upload to the cloud.',
          'Then press “Log in” at warsimbox.com and use the same name and password. Your saves are in the Saves tab.',
          'If someone else has taken your name, pick another one; your saves still move over.',
        ],
      },
      {
        heading: 'Password accounts',
        bullets: [
          'Accounts have a name and a password. Someone who sees your name on the leaderboard can no longer get into your account.',
          'When you create an account you get a recovery code; write it down. If you forget your password, use Log in → Forgot password and this code to set a new one.',
          'If you lose the code too, write to us through Feedback or social media. Once a few questions confirm the account is yours, we send a new code.',
        ],
      },
      {
        heading: 'Cloud saves',
        bullets: [
          'Your saves are kept on the server: carry on from another phone or computer with the same account.',
          'Without a connection a save is written to your device first (“on this device” tag) and uploads by itself once you are back online.',
        ],
      },
      {
        heading: 'Scores and profile',
        bullets: [
          'The Scores tab in the main menu: Kills, Wins, Earned, biggest Air force and play Time. All time and this week.',
          'Only campaigns played with an account count; scenarios and guest games do not. Time is real time: it stops when the game is open but you are away.',
          'Profile: tap your name at the top right (in a campaign, ☰ Menu → Profile and scores). Your scores, your rank and password change are there.',
        ],
      },
    ],
  },
  'yeni-gorunum': {
    title: 'A new look: sky, clouds and sunsets',
    summary: 'A day cycle, clouds, a rolling sea and contrails; aircraft in their real paint schemes and rebuilt structures.',
    captions: [
      'B-17s at 8.6 km at sunset: contrails behind the engines of high-flying aircraft.',
      'Clouds drift with the wind and cast shadows on the ground.',
      'A rolling sea that reflects the sky, with the sun’s glitter path.',
      'A P-51D in its real paint: canopy reflections, exhausts, a spinning propeller disc.',
      'A night raid: lit factory windows and tracers in the sky.',
      'Smoke columns rising from bombed buildings, bent by the wind.',
    ],
    sections: [
      {
        text: [
          'WarSimBox has a whole new look. The simple low-poly style stays; light, sky, water and detail are much richer.',
        ],
      },
      {
        heading: 'Sky and weather',
        bullets: [
          'Sky, sun and haze that thins with height: light mist in the valleys, clear air up high; the map is visible all the way to the horizon.',
          'Day cycle: one game day lasts 48 minutes. Sunrise, golden hour, sunset and a starry, moonlit night.',
          'Clouds: cumulus and stratocumulus down low, cirrus up high. They drift with the wind, cast shadows and glow at sunset. They fade out in the strategy view so the map stays readable.',
          'Sea: waves, water that reflects the sky, the glitter path of the sun (the moon at night) and foam along the shore.',
        ],
      },
      {
        heading: 'Aircraft',
        bullets: [
          'Every aircraft wears its real factory paint: camouflage patterns and national markings. Only those that were really unpainted (P-51D, B-17G, MiG-15…) are bare metal.',
          'Wood, fabric and metal surfaces, panel lines, rivets and exhaust stains; canopy reflections, a pilot, the aerial wire and a spinning propeller disc.',
          'Team colours are gone: tell friend from foe by the label colour, and in the distant view by the team-coloured arrows.',
          'Engines flying high (above 6.8 km) leave contrails, which glow orange and pink at sunset. The AI sees them too: an aircraft trailing a contrail is spotted from far away.',
        ],
      },
      {
        heading: 'Smoke, fire and buildings',
        bullets: [
          'Soft smoke and fireballs that cool to embers. Bomb smoke rises like a mushroom, and burning buildings send up black columns bent by the wind.',
          'Buildings rebuilt: brick, plaster, concrete and corrugated iron; sawtooth-roofed factories, airbases with hangars and a control tower, sandbagged flak positions and a Freya radar. Windows light up at night, and bombed buildings turn dark.',
          'Field strips, forest patches and rock layers on the terrain.',
        ],
      },
      {
        heading: 'Graphics settings',
        bullets: [
          'Settings → Graphics → Quality: Low, Medium or High. The default is Low, so phones run smoothly.',
          'Clouds, the rolling sea and the fine aircraft details appear on Medium and High. If your device is powerful, try High.',
          'The day cycle and the clouds can each be turned off (with the day cycle off it is always daytime).',
        ],
      },
    ],
  },
  ogretici: {
    title: 'Tutorial: learn the game step by step',
    summary: 'A short tutorial for new players: we plan your first mission together.',
    captions: ['It asks when you press “Start game”: start the tutorial, close it, or don’t ask again.'],
    sections: [
      {
        text: [
          'New players were finding the game confusing, so there is now a short tutorial. It asks when you press “Start game” and takes about 5 minutes.',
        ],
      },
      {
        heading: 'Five parts',
        bullets: [
          'Main menu: language, map and map size, account, news, social media and feedback.',
          'Map: panning, zooming and rotating the camera, and speeding up time.',
          'First mission: select your base, check your hangar, plan and launch your first combat air patrol together, and follow your flight.',
          'Grow your country: treasury, building, the factory and research.',
          'War: enemy targets, the alert flight and how to win.',
        ],
      },
      {
        heading: 'How it works',
        bullets: [
          'Everything except the part being shown is dimmed, and only that part can be tapped. The game pauses while you read.',
          'Skip a part with “Next part ›”, or leave with “End tutorial”.',
          'If you tick “Don’t ask again”, it is saved to your account when you are logged in, otherwise in this browser.',
          'You can also start it from inside a campaign: ☰ Menu → Tutorial.',
        ],
      },
      {
        heading: 'Also',
        bullets: [
          'Follow us: Instagram, YouTube and TikTok links are in the main menu and at the top of the News; that is where we post new videos.',
        ],
      },
    ],
  },
  'harita-buyuklugu': {
    title: 'Faster wars: map size and 2× on the open road',
    summary: 'Pick a Small 150, Medium 200 or Large 300 km map; while your flights are on the road, the game runs at 2× by itself.',
    captions: ['While a flight is on the road, the 1× button turns warm and reads “2×”.'],
    sections: [
      {
        text: [
          'On the big map, aircraft took a long time to reach their targets, and speeding the game up spoiled the fighting. Here are two fixes.',
        ],
      },
      {
        heading: 'Map size',
        bullets: [
          'In the main menu, below the map: Small 150 km, Medium 200 km (default), Large 300 km. The distance to the nearest enemy base is shown next to it.',
          'On the small map the bases are close together and the war starts quickly; on the large one, flights take longer.',
          'The terrain has the same shape at every size; runways, towns and close-up detail stay at real scale.',
          'Older saves open on the 300 km map.',
        ],
      },
      {
        heading: 'Automatic 2× on the open road',
        bullets: [
          'At 1×, if your flights are only on the road (forming up, heading to the target or returning), the game runs at 2× by itself; the 1× button turns warm and reads “2×”.',
          'It drops back to 1× at once when a mission starts (patrol, bombing, ground attack, interception), in combat, for take-off and landing, or when a known enemy comes near your flights or buildings.',
          'If you pick another speed, it is left alone. Turn it off in Settings → Game → “Automatic 2× on the open road”.',
        ],
      },
    ],
  },
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
