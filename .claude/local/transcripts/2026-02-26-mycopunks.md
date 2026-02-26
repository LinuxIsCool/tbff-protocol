# Threshold-Based Flow Funding: Design Session

## Gathering the Mycopunks

The call opened with warmth and anticipation. Shawn confirmed that everyone was welcome at his place — two spare bedrooms and a big house, though he laughed that nothing is quite as big as Dylan's aspirations. Darren joked about the only caveat being dog allergies, and someone chimed in with affection for King Kai. As more participants filed in, the group reflected on an observation from a recent conversation with Josh: there exists a subset of Mycopunks who are specifically *cyber* Mycopunks. Many people do deeply Mycopunk things but want nothing to do with the digital — they're dirt only, analog to the core. But as someone noted, Myco doesn't exclude. The fungal metaphor holds: it connects across substrates.

With the recording started, Christina set the frame. She called this gathering because, out of everything in her incredibly chaotic year, this project has sustained a steady, unwavering excitement. It's taking shape, and she wants momentum behind it — specifically, funding to bring a big pile of Mycopunk nerds to Shawn's house to run the experiments that would constitute a minimum viable dwebish stack.

She shared a Notion link with the working document. The top sections had been refined after a morning conversation with Simon, though the bottom was still rough. The basic pitch: secure an initial pool of money, somewhere between five hundred thousand and a million dollars. Dylan's vision involves a giant pile of people, and Christina had questions about whether the budget should cover just the core effort or whether others — MicroFi people, Project Weave, Kevin's work — could pull together their own two hundred thousand and join. Initially scoped for six months so people could truly focus, the timeline was shifting toward three months given the headcount, with the possibility of pitching for six and landing three.

She flagged math questions for Shawn, experiment design questions for the group, and noted she had done significant work on network health measurement with Social Roots that wasn't yet folded into the document. Then she turned the floor over.

## X402, CRDTs, and the Emerging Stack

Jeff jumped in, eager to share what he'd been building over recent days at ETH Denver and in Boulder. He explained how threshold-based flow funding could benefit enormously from X402 and Byzantine Fault Tolerant CRDTs — a flurry of acronyms with real consequence.

X402, he explained, was the rage at ETH Denver. It's a forgotten HTTP payment layer — the way 404 means "page not found," 402 was originally reserved for "payment required," but it was never implemented. Now it can be picked up and used as an internet-native payment layer for microservices between agents. Jeff had already built it in.

He walked through the interface he'd developed. Users can add sources — wallets, credit cards, a fiat-to-crypto gateway through Transak. X402 is set up alongside Byzantine Fault Tolerant CRDT tokens, which means tokens can be spun up on an Automerge ledger, created and deprecated over and over again. They don't have to be financial, but they can be if rolled up onto a blockchain or placed in a liquidity pool with valued tokens. Subdomains of a space can now have their own tokens.

The identity layer uses a passkey system — private key cryptography in the browser, no wallet required. Social recovery is built in: set three guardians, and if you and two others sign, the key is recoverable. It's all email-based. Users click on their flows, adjust minimums and maximums, view inflows, outflows, and overflows, and define where excess flows. These can connect to proposals in the group's voting or note systems.

Jeff began expanding into the broader stack — "our space" as a suite of shared digital tools: a group calendar with maps, moon cycles, multi-scale zoom, spatial views that shift from countries at the month level to continents at the year level. But Simon gently intervened, noting the group should stick to threshold-based flow funding — the purpose of the call. Jeff graciously pivoted, though he offered to demo the full stack afterward for anyone who wanted to stay.

## The Mechanics of the Bucket

Jeff proposed an enhancement to the algorithm: the more you overflow, the more your retainer grows. If you start with inflow and outflow balanced — no overflow — your bucket stays the same size. But as your overflow increases, the walls of your bucket should expand. Maybe 91% overflows outward and 9% goes to growing your own capacity. The more you flow, the more you grow.

Simon liked the idea but got stuck on a mechanical question. If someone's balance drops because they're spending, does the bucket keep getting topped up? Could a person spend through ten thousand dollars in a month when their minimum threshold is three thousand?

Shawn clarified. The system is designed to be continuous, broken into high-frequency redistribution periods within a defined interval — inspired by on-chain streaming payments like Superfluid. The minimum threshold governs inflows, not spending. There's a maximum inflow before overflow kicks in, and the mechanism is time-regulated. You can't drain your funnel because funds only release at a set rate — three thousand a month, or a hundred a day, however it's configured. What happens after funds are released to you is outside the algorithm's concern. It lands in your wallet; you pay your mortgage, buy a sandwich, whatever you need.

Jeff reframed it with a metaphor: a bucket with a hole in it. The hole is your spend — fund release, really — and as the bucket overflows, that's the excess flowing forward to others. The algorithm originally says nothing about what happens to the fluid after it passes through the hole. It just regulates the filling and overflowing.

## The Question of Home Ownership and Thresholds

Simon raised a deeper, more philosophical question — one that came from a conversation with Andrew Hass and Andrew Allen. If someone doesn't own their home and wants to, where do they set their max threshold? Anything above rent goes to survival, not savings. Should they set their maximum at one hundred thousand? And for someone who already owns their home, perhaps they need less. This opens into thorny questions about how we relate to money, accumulation, and ownership.

Shawn responded that the system is about modulating each other's flows. You request a width of stream flowing into your bucket — a minimum and maximum. When your bucket overflows, you specify where it goes. But the algorithm has no observability into what you do with the funds once they arrive. It doesn't require you to justify your spend. If you see someone receiving five thousand a month and you trust them within the network, that's sufficient. You know each other, you can see the flows, and you don't need to audit each other's savings accounts. That's the social layer — community formation, not mechanism design.

## Visibility, Observability, and Trust

Christina turned the discussion to observability — what should be visible, to whom, and how far? Some larger funders would want to see where their money goes. Should the system be fully opaque and trust-based? Should you be able to see two hops forward — who you fund and what they do with it? Or should it be fully transparent?

Shawn offered two points. First, the network itself can be visible — you can see any number of hops forward in terms of flows, though not necessarily in terms of personal spending. Second, the system needs to be built in layers. He's always searching for the simplest possible mechanism — like quadratic funding, which is just a tiny equation with about five symbols, yet it spawned the entire complexity of Gitcoin through three major iterations. The simple kernel allows for complex emergence; complicated rules squash behavior into simplicity.

Christina pointed to a "simple rules" section in the document — five rules that she hoped would map onto Shawn's math. She proposed three pace layers of simple rules. The first, slowest layer lives in the math itself — structural and foundational. The second is at the membrane or holon level, where governance decisions happen: one network might want full transparency while another operates on pure trust. The third is the fastest layer — fashion, learning, memes, experiments, whatever needs to move quickly.

Shawn lit up at the concept. He's obsessed with rhythms at different scales. Imagine long-term network funding over ten or a hundred years, alongside quick experiments where someone new joins and gets a small, short-term allocation to prove an idea. The pace layers give structure to that variation.

## Holonic Architecture and Federation

The conversation turned to how these layers interact. If a hundred-year holon has million-dollar minimums, does that distort the smaller flows around it? Isn't this, Darren suggested, precisely the beauty of the holonic architecture — trust can be validated through the layers? You wouldn't have one monolithic holon, but many nested ones.

Jeff pushed back gently. Holons nest in theory, but the reality is Venn diagrams — people exist in many networks, many projects. If the fundamental holon is the planet itself, the scale of funding required is staggering, and the minimum flows don't kick in until everyone meets their minimum. That's trillions. How do you separate long-term planetary aims from the math that actually distributes money to people in the short term?

Shawn's answer was direct: federate. Start small, think sufficiency at the smallest scale, and then federate outward. There is no single global holon — the global picture emerges from the connection of all local holons. Not just economic flows propagate through them, but also trust, delegation, data, information, and reputation. If you see a problem at the global scale, you change your local behavior and watch the propagation shift.

## What We Can Do Now

Christina brought the discussion back to earth. For the initial experiment, what from the layering and pace layer thinking actually needs to be in version one? Shawn noted that pace layering is essentially clock synchronization — connecting chains, social dynamics, and different timescales properly. But Jeff argued for pragmatism: for this first round, it's going to be a manual monthly pulse, not on-chain. The goal is to get money and give it to people to come to Shawn's house around May.

The urgency was concrete. Dylan and possibly Simon would be at "Funding the Commons" in mid-March, an opportunity to pitch funders directly. Christina wanted to go but had the LA water project the following week and family obligations. She asked what they were blocked on.

Jeff pushed hard: what's the actual blocker? He felt the technical infrastructure was already ready — X402, Byzantine Fault Tolerant Automerge tokens, fiat-to-crypto and crypto-to-fiat transfers. He wanted a place to set his min-max and start playing. The remaining blockers, in his view, were international accounting, tax implications, and "boring but necessary" questions like those.

The group pinned initial parameters: a starting minimum of three thousand per month and a starting maximum of eight or nine thousand — roughly one month's runway as the floor and three months as the ceiling, beyond which you start overflowing.

## Configurability and Mechanism Design

Shawn clarified that minimums and maximums should be customizable — a subnet or network might need a much larger maximum than an individual. But a maximum is needed, otherwise nothing overflows. Unless, he noted, you set overflow as a proportion of inflow or outflow rather than as a threshold on a bucket. The system is fully programmable: overflow can trigger when the maximum is hit, or as a proportion from the very start, or the bucket can grow as overflow increases. Between your minimum and your comfort zone, you're already overflowing a little. The closer you get to comfort, the more overflows. Beyond comfort, everything overflows.

This is where mechanism design meets the road. Even questions like "what happens if I change someone's flow rate mid-month?" open up design choices: does the change take effect immediately, at the end of the period, or at some rate-of-rate-of-change? The process is to identify user requirements, determine system design invariants and natural principles, and then allow for customizable parameters within those constraints.

## Showing Something Real

Jeff made a pitch that Christina's Fathom recording could carry forward: investors and philanthropists will want to see visualizations of the flow. The tools he's building can show, simulate, and integrate with fiat payment systems. They could tell not just aligned funders but even credit card retail investors: put in a flow, sponsor a bioregional group with fifty dollars a month, earn tokens. And because it all runs on Byzantine Fault Tolerant Automerge tokens rather than specific chains, there's no need to commit to infrastructure. It's lighter, cheaper, and they can start experimenting immediately.

His concern was that asking investors for money and tracking it on a spreadsheet isn't compelling. But showing them the actual flow funding visualization system — built on zero dollars — and saying "imagine what we can do with real funding" is a different pitch entirely. Within a couple of hours, they could set up a simulation with the people on the call plus their first degree of separation.

## Bioregional Connections

Darren brought in another thread. He's part of a landscape hub cultivator with Regenerate Cascadia — Christina is also involved — and their roadmap already includes flow funding across ten different landscape groups throughout Cascadia, including his in Victoria and Christina's. Regenerate Cascadia has funding from the Novo Foundation and growing recognition. Their current concept of flow funding is simpler — more in the kinship earth tradition of finding trusted people and flowing funds to them. What the group is building isn't on their radar yet, but it could be a powerful collaboration.

Someone noted that Joe Brewer would likely be interested. There might be resistance from people steeped in purely trust-based systems who bristle at anything that smells like crypto. But the group was emphatic: this isn't crypto. No fees, no fights — just flow and funds. Jeff riffed on this, sharing FUNZ.quest, a quick project he'd spun up for tipping and flowing small amounts, and dokindthings.fund, a bonding curve community fund where people can spend from a group wallet when they see kind acts.

## Starting from the Ground Up

Shawn articulated a vision for how to begin. He pushed against thinking of these flows as salary replacements and toward thinking of them as sub-UBI contribution funds. He'd rather have a hundred networks each flowing him a hundred dollars a month because they appreciate him, than three thousand from a single source that demands to know what he's doing with his time. For him, the mechanism starts from where trust already exists — five hundred a month from Bonding Curve Research Group for the work he's already doing, the same from Block Science, the same from every research group he's part of. Each of these funnels pays a stream into his personal funnel, and if people appreciate him more, the overflow goes forward — to Simon, Darren, Shawn specifically, or to someone he knows is between opportunities.

The system allows for that predictability and planning. You can see visually what proportion of your streams goes where. Some flows fund hard deliverables; others are softer — socially recognized contributions. Maybe Darren doesn't post a lot, but someone sees him doing meaningful work and surfaces it. External validation becomes possible. Someone better at tracking tasks can say, "Here's where Darren's value is going," and the network can respond accordingly.

The fundamental insight is that this isn't about imposing structure from above. It's about creating a mechanism that starts small, respects existing trust relationships, and lets complexity emerge through federation — from person to holon to network of holons, flowing not just money but attention, trust, and recognition through the connective tissue of communities that already care about each other.

## Next Steps

The group agreed to reconvene at the same time the following week, continue refining the experiment design document, address tax and accounting implications, and prepare for investor conversations — whether at Funding the Commons in March or through direct outreach. The immediate priority: show something real, start a small simulation, and let the flows speak for themselves.
