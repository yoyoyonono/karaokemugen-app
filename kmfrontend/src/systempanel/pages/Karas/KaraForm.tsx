import {
	DeleteOutlined,
	DoubleRightOutlined,
	MinusOutlined,
	PlusOutlined,
	QuestionCircleOutlined,
	UploadOutlined,
} from '@ant-design/icons';
import {
	Alert,
	Button,
	Card,
	Checkbox,
	Col,
	Collapse,
	Divider,
	Form,
	FormInstance,
	Input,
	InputNumber,
	Modal,
	Radio,
	Row,
	Select,
	Tag,
	Tooltip,
	Typography,
	Upload,
	message,
} from 'antd';
import { SelectValue } from 'antd/lib/select';
import { filesize } from 'filesize';
import i18next from 'i18next';
import { Component, createRef } from 'react';
import { v4 as UUIDv4 } from 'uuid';
import './KaraForm.scss';

import { CheckboxChangeEvent } from 'antd/lib/checkbox';
import { PositionX, PositionY } from '../../../../../src/lib/types';
import { DBKara } from '../../../../../src/lib/types/database/kara';
import { KaraFileV4, MediaInfo, MediaInfoValidationResult } from '../../../../../src/lib/types/kara';
import { Config } from '../../../../../src/types/config';
import GlobalContext from '../../../store/context';
import { buildKaraTitle, getTagInLocale } from '../../../utils/kara';
import { commandBackend } from '../../../utils/socket';
import { getTagTypeName, tagTypes, tagTypesKaraFileV4Order } from '../../../utils/tagTypes';
import EditableGroupAlias from '../../components/EditableGroupAlias';
import EditableTagGroup from '../../components/EditableTagGroup';
import LanguagesList from '../../components/LanguagesList';
import OpenLyricsFileButton from '../../components/OpenLyricsFileButton';

const { Paragraph } = Typography;
const { Panel } = Collapse;

interface KaraFormProps {
	kara: DBKara;
	save: any;
	handleCopy: (kid: string, repo: string) => void;
	handleDelete: (kid: string) => void;
}

interface KaraFormState {
	titles: Record<string, string>;
	defaultLanguage: string;
	titlesIsTouched: boolean;
	serieSingersRequired: boolean;
	subfile: any[];
	announcePosition: string | null | undefined;
	mediafile: any[];
	mediafileIsTouched: boolean;
	subfileIsTouched: boolean;
	applyLyricsCleanup: boolean;
	mediaInfo?: MediaInfo;
	mediaInfoValidationResult?: MediaInfoValidationResult[];
	isEncodingMedia?: boolean;
	encodeMediaOptions?: {
		trim?: boolean;
	};
	repositoriesValue: string[];
	repoToCopySong: string;
	comment?: string;
	karaSearch: { label: string; value: string }[];
	parentKara: DBKara;
	errors: string[];
}

class KaraForm extends Component<KaraFormProps, KaraFormState> {
	formRef = createRef<FormInstance>();
	static contextType = GlobalContext;
	context: React.ContextType<typeof GlobalContext>;
	timer: NodeJS.Timeout;

	constructor(props) {
		super(props);
		const kara = this.props.kara;
		this.getRepositories();
		this.state = {
			titles: kara?.titles ? kara.titles : {},
			defaultLanguage: kara?.titles_default_language || null,
			titlesIsTouched: false,
			serieSingersRequired: kara ? false : true,
			subfile: kara?.subfile
				? [
						{
							uid: -1,
							name: kara.subfile,
							status: 'done',
						},
					]
				: [],
			mediafile: kara?.mediafile
				? [
						{
							uid: -1,
							name: kara.mediafile,
							status: 'done',
						},
					]
				: [],
			mediafileIsTouched: false,
			subfileIsTouched: false,
			applyLyricsCleanup: false,
			mediaInfo: {} as unknown as MediaInfo, // Has to be defined for reactive things
			isEncodingMedia: false,
			encodeMediaOptions: {
				trim: false,
			},
			repositoriesValue: null,
			repoToCopySong: null,
			comment: kara?.comment,
			karaSearch: [],
			parentKara: null,
			errors: [],
			announcePosition:
				(kara?.announce_position_x &&
					kara?.announce_position_y &&
					`${kara.announce_position_x},${kara.announce_position_y}`) ||
				undefined,
		};
	}

	componentDidMount() {
		this.formRef.current.validateFields();
		this.getParents();
		this.loadMediaInfo();
		this.setState({
			applyLyricsCleanup: this.context.globalState.settings.data.config?.Maintainer?.ApplyLyricsCleanupOnKaraSave,
		});
	}

	getParents = async () => {
		if (this.formRef.current.getFieldValue('parents') !== null) {
			const parents: string[] = this.formRef.current.getFieldValue('parents');
			if (parents.length > 0) {
				const res = await commandBackend('getKaras', { q: `k:${parents.join()}`, ignoreCollections: true });
				const karaSearch = res.content.map(kara => {
					return {
						label: buildKaraTitle(this.context.globalState.settings.data, kara, true, res.i18n),
						value: kara.kid,
					};
				});
				this.setState({ karaSearch });
			}
		}
	};

	loadMediaInfo = async () => {
		if (this.props.kara?.kid && this.props.kara?.download_status === 'DOWNLOADED') {
			const mediaInfo: MediaInfo = await commandBackend(
				'getKaraMediaInfo',
				{ kid: this.props.kara.kid },
				false,
				60000
			);
			this.setState({ mediaInfo });
			this.validateMediaRules();
		}
	};

	validateMediaRules = async () => {
		const repo: string = this.formRef.current?.getFieldValue('repository');
		if (this.state.mediaInfo && repo) {
			const mediaInfoValidationResult: MediaInfoValidationResult[] = await commandBackend(
				'validateMediaInfo',
				{ mediaInfo: this.state.mediaInfo, repository: repo },
				false,
				60000
			);
			this.setState({ mediaInfoValidationResult });
		}
	};

	renderMediaInfo = (mediaInfo: MediaInfo, mediaInfoValidationResults: MediaInfoValidationResult[]) => {
		const propertiesToDisplay: Array<{
			name: keyof MediaInfo;
			title: string;
			format?: (value: any) => string;
			formatSuggestedValue?: (value: any) => string;
		}> = [
			{ name: 'fileExtension', title: 'KARA.MEDIA_FILE_INFO.FILE_FORMAT' },
			{
				name: 'size',
				title: 'KARA.MEDIA_FILE_INFO.FILE_SIZE',
				format: value => value && filesize(value).toString(),
				formatSuggestedValue: value => value && 'max. ' + filesize(value).toString(),
			},
			{
				name: 'overallBitrate',
				title: 'KARA.MEDIA_FILE_INFO.OVERALL_BITRATE',
				// Convert from MB/s to kb/s
				format: (value: number) => value && `${Math.round((8 * value) / 1000)} kb/s`,
				formatSuggestedValue: value => value && `max. ${Math.round((8 * value) / 1000)} kb/s`,
			},
			{ name: 'videoCodec', title: 'KARA.MEDIA_FILE_INFO.VIDEO_CODEC' },
			{ name: 'videoColorspace', title: 'KARA.MEDIA_FILE_INFO.VIDEO_COLORSPACE' },
			{
				name: 'videoAspectRatio',
				title: 'KARA.MEDIA_FILE_INFO.VIDEO_ASPECT_RATIO',
				format: (value: any) => `SAR ${value?.pixelAspectRatio} DAR ${value?.displayAspectRatio}`,
			},
			{
				name: 'videoResolution',
				title: 'KARA.MEDIA_FILE_INFO.VIDEO_RESOLUTION',
				format: (value: any) => value.formatted,
			},
			{
				name: 'videoFramerate',
				title: 'KARA.MEDIA_FILE_INFO.VIDEO_FRAMERATE',
				format: (value: number) => `${value} fps`,
			},
			{ name: 'audioCodec', title: 'KARA.MEDIA_FILE_INFO.AUDIO_CODEC' },
			{ name: 'hasCoverArt', title: 'KARA.MEDIA_FILE_INFO.AUDIO_COVER_ART' },
		];

		const rows = propertiesToDisplay
			.map(property => ({
				...property,
				valueFormatted:
					mediaInfo &&
					mediaInfo[property.name] &&
					((property.format && property.format(mediaInfo[property.name])) ||
						String(mediaInfo[property.name])),
				validationResult: mediaInfoValidationResults?.find(r => r.name === property.name),
			}))
			.map(property => ({
				...property,
				suggestedValueFormatted:
					property.validationResult?.suggestedValue &&
					((property.formatSuggestedValue &&
						property.formatSuggestedValue(property.validationResult?.suggestedValue)) ||
						(property.format && property.format(property.validationResult?.suggestedValue)) ||
						String(property.validationResult?.suggestedValue)),
				className:
					property.validationResult?.mandatory === true
						? 'unmet-required'
						: property.validationResult
							? 'unmet-warning'
							: '',
			}));

		return (
			<table style={{ borderSpacing: '0 10px' }}>
				<tbody className="media-info">
					{rows.map(r => (
						<tr className={r.className} key={r.name}>
							<td>{i18next.t(r.title)}</td>
							<td>{r.valueFormatted || '-'}</td>
							{r.suggestedValueFormatted && (
								<td>
									<DoubleRightOutlined /> {r.suggestedValueFormatted}
								</td>
							)}
						</tr>
					))}
				</tbody>
			</table>
		);
	};

	openChildrenModal = async (event, kid: string) => {
		event.stopPropagation();
		event.preventDefault();
		const parent: DBKara = await commandBackend('getKara', { kid });
		if (parent.children.length > 0) {
			const childrens = await commandBackend('getKaras', {
				q: `k:${parent.children.join()}`,
				ignoreCollections: true,
			});
			Modal.info({
				title: i18next.t('KARA.CHILDRENS', {
					parent: buildKaraTitle(this.context.globalState.settings.data, parent, true),
				}),
				content: (
					<ul>
						{childrens.content?.map(kara => (
							<a href={`/system/karas/${kara.kid}`} key={kara.kid}>
								<li key={kara.kid}>
									{buildKaraTitle(this.context.globalState.settings.data, kara, true, childrens.i18n)}
								</li>
							</a>
						))}
					</ul>
				),
			});
		}
	};

	getRepositories = async () => {
		const res = await commandBackend('getRepos');
		this.setState(
			{ repositoriesValue: res.filter(repo => repo.MaintainerMode || !repo.Online).map(repo => repo.Name) },
			() =>
				this.formRef.current.setFieldsValue({
					repository:
						this.props.kara?.repository ||
						(this.state.repositoriesValue ? this.state.repositoriesValue[0] : null),
				})
		);
	};

	saveApplyLyricsCleanupSetting = (enabled: boolean) =>
		commandBackend('updateSettings', {
			setting: { Maintainer: { ApplyLyricsCleanupOnKaraSave: enabled } } as Partial<Config>,
		}).catch(() => {});

	previewHooks = async () => {
		if (
			!this.state.defaultLanguage ||
			!this.state.titles ||
			Object.keys(this.state.titles).length === 0 ||
			!this.state.titles[this.state.defaultLanguage]
		) {
			message.error(i18next.t('KARA.TITLE_REQUIRED'));
		} else {
			const data = await commandBackend(
				'previewHooks',
				this.getKaraToSend(this.formRef.current.getFieldsValue()),
				false,
				300000
			);
			Modal.info({
				title: i18next.t('KARA.PREVIEW_HOOKS_MODAL'),
				content: (
					<ul>
						{data.addedTags?.map(tag => (
							<div key={tag.tid} title={tag.tagfile}>
								<PlusOutlined style={{ marginRight: '2px' }} />
								{getTagInLocale(this.context?.globalState.settings.data, tag).i18n} (
								{i18next.t(`TAG_TYPES.${getTagTypeName(tag.types[0])}_other`)})
							</div>
						))}
						{data.removedTags?.map(tag => (
							<div key={tag.tid} title={tag.tagfile}>
								<MinusOutlined style={{ marginRight: '2px' }} />
								{getTagInLocale(this.context?.globalState.settings.data, tag).i18n} (
								{i18next.t(`TAG_TYPES.${getTagTypeName(tag.types[0])}_other`)})
							</div>
						))}
					</ul>
				),
			});
		}
	};

	handleSubmit = values => {
		this.setState({ errors: [] });
		if (this.state.mediafileIsTouched && !this.state.mediaInfo?.loudnorm) {
			message.error(i18next.t('KARA.MEDIA_IN_PROCESS'));
		} else if (
			this.state.mediafileIsTouched &&
			(!this.state.mediaInfoValidationResult || this.state.mediaInfoValidationResult?.some(r => r.mandatory))
		) {
			message.error(i18next.t('KARA.MEDIA_REPOSITORY_RULES_UNMET'));
		} else if (
			!this.state.defaultLanguage ||
			!this.state.titles ||
			Object.keys(this.state.titles).length === 0 ||
			!this.state.titles[this.state.defaultLanguage]
		) {
			message.error(i18next.t('KARA.TITLE_REQUIRED'));
		} else {
			this.props.save(this.getKaraToSend(values));
		}
	};

	handleDelete = e => {
		this.props.handleDelete(this.props.kara.kid);
	};

	getKaraToSend = values => {
		const kara: DBKara = values;
		const mediaVersionArr = this.state.titles[this.state.defaultLanguage].split(' ~ ');
		const mediaVersion =
			mediaVersionArr.length > 1 ? mediaVersionArr[mediaVersionArr.length - 1].replace(' Vers', '') : 'Default';
		const [announcePositionX, announcePositionY] = this.state.announcePosition?.split(',') || [
			undefined,
			undefined,
		];
		// Convert Kara to KaraFileV4
		const karaFile: KaraFileV4 = {
			header: {
				version: 4,
				description: 'Karaoke Mugen Karaoke Data File',
			},
			medias: [
				{
					version: mediaVersion,
					filename: this.state.mediaInfo.filename || this.props.kara?.mediafile,
					loudnorm: this.state.mediaInfo.loudnorm || this.props.kara?.loudnorm,
					filesize: this.state.mediaInfo.size || this.props.kara?.mediasize,
					duration: this.state.mediaInfo.duration || this.props.kara?.duration,
					default: true,
					lyrics:
						kara.subfile || announcePositionX
							? [
									{
										filename: kara.subfile || null,
										default: true,
										version: 'Default',
										announcePositionX: announcePositionX as PositionX,
										announcePositionY: announcePositionY as PositionY,
									},
								]
							: [],
				},
			],
			data: {
				comment: kara.comment || undefined,
				created_at: this.props.kara?.created_at
					? new Date(this.props.kara?.created_at).toISOString()
					: new Date().toISOString(),
				ignoreHooks: kara.ignore_hooks,
				kid: this.props.kara?.kid || UUIDv4(),
				modified_at: new Date().toISOString(),
				parents:
					kara.parents?.length > 0
						? kara.parents.filter((e, pos) => kara.parents.indexOf(e) === pos)
						: undefined,
				repository: kara.repository,
				songorder: kara.songorder ? kara.songorder : undefined,
				tags: Object.fromEntries(
					tagTypesKaraFileV4Order // Get tagtypes
						.map(t => tagTypes[t].karajson) // Iterate through them to get the good value
						.map(t => {
							// Find the good things
							if (kara[t] instanceof Array && kara[t].length > 0) {
								return [t, kara[t].map(t2 => t2.tid)];
							} else {
								return [t, undefined];
							}
						})
				) as unknown as any,
				from_display_type: kara.from_display_type,
				titles: this.state.titles,
				titles_default_language: this.state.defaultLanguage,
				titles_aliases: kara.titles_aliases?.length > 0 ? kara.titles_aliases : undefined,
				year: kara.year,
			},
			meta: {},
		};
		return {
			kara: karaFile,
			modifiedLyrics: this.state.subfileIsTouched,
			modifiedMedia: this.state.mediafileIsTouched,
			applyLyricsCleanup: this.state.applyLyricsCleanup,
		};
	};

	handleSubmitFailed = ({ values, errorFields }) => {
		this.setState({ errors: errorFields.map(value => value.errors).reduce((acc, val) => acc.concat(val), []) });
	};

	isMediaFile = (filename: string): boolean => {
		return new RegExp(`^.+\\.(${this.context.globalState.settings.data.state?.supportedMedias.join('|')})$`).test(
			filename
		);
	};

	isSubFile = (filename: string): boolean => {
		return new RegExp(`^.+\\.(${this.context.globalState.settings.data.state?.supportedLyrics.join('|')})$`).test(
			filename
		);
	};

	onMediaUploadChange = async info => {
		const fileList = info.fileList.slice(-1);
		this.setState({ mediafile: fileList });
		if (info.file.status === 'uploading') {
			this.formRef.current.setFieldsValue({ mediafile: null });
			this.setState({ mediaInfo: null, mediaInfoValidationResult: null });
		} else if (info.file.status === 'done') {
			if (this.isMediaFile(info.file.name)) {
				this.setState({ mediafileIsTouched: true });
				const mediaInfo: MediaInfo = await commandBackend(
					'processUploadedMedia',
					{
						origFilename: info.file.response.originalname,
						filename: info.file.response.filename,
					},
					false,
					60000
				);
				this.setState({ mediaInfo });
				this.validateMediaRules();
				this.formRef.current.setFieldsValue({ mediafile: mediaInfo.filename });
				message.success(i18next.t('KARA.ADD_FILE_SUCCESS', { name: info.file.name }));
			} else {
				this.formRef.current.setFieldsValue({ mediafile: null });
				message.error(i18next.t('KARA.ADD_FILE_MEDIA_ERROR', { name: info.file.name }));
				info.file.status = 'error';
				this.setState({ mediafile: [] });
			}
		} else if (info.file.status === 'error' || info.file.status === 'removed') {
			this.formRef.current.setFieldsValue({ mediafile: null });
			this.setState({ mediafile: [] });
		}
		this.formRef.current.validateFields();
	};

	onSubUploadChange = info => {
		const fileList = info.fileList.slice(-1);
		this.setState({ subfile: fileList });
		if (info.file.status === 'uploading') {
			this.formRef.current.setFieldsValue({ subfile: null });
		} else if (info.file.status === 'done') {
			if (this.isSubFile(info.file.name)) {
				this.setState({ subfileIsTouched: true });
				this.formRef.current.setFieldsValue({ subfile: info.file.response.filename });
				message.success(i18next.t('KARA.ADD_FILE_SUCCESS', { name: info.file.name }));
			} else {
				this.formRef.current.setFieldsValue({ subfile: null });
				message.error(i18next.t('KARA.ADD_FILE_LYRICS_ERROR', { name: info.file.name }));
				info.file.status = 'error';
				this.setState({ subfile: [] });
			}
		} else if (info.file.status === 'error' || info.file.status === 'removed') {
			this.formRef.current.setFieldsValue({ subfile: null });
			this.setState({ subfile: [] });
		}
	};

	onChangeSingersSeries = () => {
		this.setState(
			{
				serieSingersRequired:
					this.formRef.current.getFieldValue('singers')?.length === 0 &&
					this.formRef.current.getFieldValue('singergroups')?.length === 0 &&
					this.formRef.current.getFieldValue('series')?.length === 0,
			},
			() => {
				this.formRef.current.validateFields(['series']);
				this.formRef.current.validateFields(['singergroups']);
				this.formRef.current.validateFields(['singers']);
			}
		);
	};

	search = value => {
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(async () => {
			const karas = await commandBackend('getKaras', {
				filter: value,
				size: 50,
				ignoreCollections: true,
			}).catch(() => {
				return { content: [] };
			});
			if (karas.content) {
				this.setState({
					karaSearch: karas.content
						.filter(k => k.kid !== this.props.kara?.kid)
						.filter(k => !k.parents.includes(this.props.kara?.kid))
						.map(k => {
							return {
								label: buildKaraTitle(this.context.globalState.settings.data, k, true, karas.i18n),
								value: k.kid,
							};
						}),
				});
			}
		}, 1000);
	};

	onParentKaraChange = async (event: SelectValue) => {
		if (event && event[0] && !event[1]) {
			await this.applyFieldsFromKara(event[0] as string);
		}
	};

	applyFieldsFromKara = async (kid: string) => {
		const karas = await commandBackend('getKaras', {
			q: 'k:' + kid,
			size: 1,
			ignoreCollections: true,
		});
		const parentKara = karas && (karas.content[0] as DBKara);
		if (parentKara && parentKara.kid === kid) {
			// Check if user has already started doing input, or if it's an edit of existing kara
			if (
				!this.props.kara?.kid &&
				this.state.titlesIsTouched !== true &&
				this.formRef.current.isFieldsTouched(['versions', 'series', 'language']) !== true
			) {
				this.setState({
					titles: parentKara.titles,
					defaultLanguage: parentKara.titles_default_language,
					parentKara,
				});
				const oldFormFields = this.formRef.current.getFieldsValue(['mediafile', 'subfile']); // Fields to take over to the applied kara
				this.formRef.current.resetFields();
				this.formRef.current.setFieldsValue(oldFormFields); // Re-sets media and lyrics file, if already uploaded
				this.onChangeSingersSeries();
			}
		}
	};

	submitHandler(e) {
		e.key === 'Enter' && e.preventDefault();
	}

	mapTagTypesToSelectOption = (tagType: string) => (
		<Select.Option key={tagType} value={tagType.toLowerCase()}>
			{i18next.t(tagType ? `TAG_TYPES.${tagType}_one` : 'TAG_TYPES.DEFAULT')}
		</Select.Option>
	);

	mapRepoToSelectOption = (repo: string) => (
		<Select.Option key={repo} value={repo}>
			{repo}
		</Select.Option>
	);

	tagRender = ({ label, value, closable, onClose }) => {
		return (
			<Tag closable={closable} onClose={onClose} style={{ whiteSpace: 'normal' }}>
				<label style={{ cursor: 'pointer' }} onMouseDown={event => this.openChildrenModal(event, value)}>
					{label}
				</label>
			</Tag>
		);
	};

	render() {
		return (
			<Form
				ref={this.formRef}
				onFinish={this.handleSubmit}
				onFinishFailed={this.handleSubmitFailed}
				className="kara-form"
				initialValues={{
					series: this.props.kara?.series || this.state.parentKara?.series,
					songtypes: this.props.kara?.songtypes || this.state.parentKara?.songtypes,
					songorder: this.props.kara?.songorder || this.state.parentKara?.songorder,
					langs: this.props.kara?.langs || this.state.parentKara?.langs,
					from_display_type:
						this.props.kara?.from_display_type || this.state.parentKara?.from_display_type || '',
					year: this.props.kara?.year || this.state.parentKara?.year || new Date().getFullYear(),
					singers: this.props.kara?.singers || this.state.parentKara?.singers,
					singergroups: this.props.kara?.singergroups || this.state.parentKara?.singergroups,
					songwriters: this.props.kara?.songwriters || this.state.parentKara?.songwriters,
					creators: this.props.kara?.creators || this.state.parentKara?.creators,
					authors: this.props.kara?.authors || this.state.parentKara?.authors,
					families: this.props.kara?.families || this.state.parentKara?.families,
					platforms: this.props.kara?.platforms || this.state.parentKara?.platforms,
					franchises: this.props.kara?.franchises || this.state.parentKara?.franchises,
					genres: this.props.kara?.genres || this.state.parentKara?.genres,
					origins: this.props.kara?.origins || this.state.parentKara?.origins,
					misc: this.props.kara?.misc || this.state.parentKara?.misc,
					warnings: this.props.kara?.warnings || this.state.parentKara?.warnings,
					groups: this.props.kara?.groups || this.state.parentKara?.groups,
					versions: this.props.kara?.versions || this.state.parentKara?.versions,
					comment: this.props.kara?.comment || '',
					ignore_hooks: this.props.kara?.ignore_hooks || false,
					repository:
						this.props.kara?.repository ||
						// Check if repo from parent is in the allowed list or take the default one
						(this.state.repositoriesValue &&
							((this.state.repositoriesValue?.includes(this.state.parentKara?.repository) &&
								this.state.parentKara?.repository) ||
								this.state.repositoriesValue[0])) ||
						null,
					mediafile: this.props.kara?.mediafile,
					subfile: this.props.kara?.subfile,
					parents: this.props.kara?.parents || (this.state.parentKara && [this.state.parentKara?.kid]) || [],
					titles_aliases: this.props.kara?.titles_aliases || this.state.parentKara?.titles_aliases,
					collections: this.props.kara?.collections || this.state.parentKara?.collections,
				}}
			>
				<Divider orientation="left">{i18next.t('KARA.SECTIONS.FILES')}</Divider>
				<Form.Item
					label={
						<span>
							{i18next.t('KARA.MEDIA_FILE')}&nbsp;
							<Tooltip
								title={i18next.t('KARA.MEDIA_FILE_TOOLTIP', {
									formats: this.context.globalState.settings.data.state?.supportedMedias?.join(', '),
								})}
							>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 12 }}
				>
					<Row gutter={32}>
						<Col>
							<Form.Item
								name="mediafile"
								rules={[
									{
										required: true,
										message: i18next.t('KARA.MEDIA_REQUIRED'),
									},
								]}
							>
								<Upload
									headers={{
										authorization: localStorage.getItem('kmToken'),
										onlineAuthorization: localStorage.getItem('kmOnlineToken'),
									}}
									action="/api/importFile"
									accept="video/*,audio/*,.mkv"
									multiple={false}
									onChange={this.onMediaUploadChange}
									fileList={this.state.mediafile}
								>
									<Button>
										<UploadOutlined />
										{i18next.t('KARA.MEDIA_FILE')}
									</Button>
								</Upload>
							</Form.Item>
						</Col>
						{this.props.kara?.download_status === 'DOWNLOADED' || this.state.mediaInfo?.size ? (
							<Col flex={'0 1 280px'}>
								<Card>
									{this.renderMediaInfo(this.state.mediaInfo, this.state.mediaInfoValidationResult)}
									{this.state.mediaInfo?.warnings?.length > 0 && (
										<div className="media-info warnings">
											{this.state.mediaInfo.warnings.map(w => (
												<div className="unmet-warning">
													{i18next.t('KARA.MEDIA_FILE_INFO.WARNINGS.' + w)}
												</div>
											))}
										</div>
									)}
								</Card>
							</Col>
						) : null}
					</Row>
				</Form.Item>
				<Form.Item
					label={
						<span>
							{i18next.t('KARA.LYRICS_FILE')}&nbsp;
							<Tooltip
								title={i18next.t('KARA.LYRICS_FILE_TOOLTIP', {
									formats: this.context.globalState.settings.data.state?.supportedLyrics?.join(', '),
								})}
							>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 12 }}
				>
					<Row gutter={32}>
						<Col>
							<Form.Item name="subfile" style={{ marginBottom: '0' }}>
								<Upload
									headers={{
										authorization: localStorage.getItem('kmToken'),
										onlineAuthorization: localStorage.getItem('kmOnlineToken'),
									}}
									action="/api/importFile"
									accept={this.context.globalState.settings.data.state?.supportedLyrics
										.map(e => `.${e}`)
										.join(',')}
									multiple={false}
									onChange={this.onSubUploadChange}
									fileList={this.state.subfile}
								>
									<Button>
										<UploadOutlined />
										{i18next.t('KARA.LYRICS_FILE')}
									</Button>
								</Upload>
							</Form.Item>

							{this.state.subfile?.length > 0 && (
								<Checkbox
									checked={this.state.applyLyricsCleanup}
									onChange={(e: CheckboxChangeEvent) => {
										this.saveApplyLyricsCleanupSetting(e.target.checked);
										this.setState({ applyLyricsCleanup: e.target.checked });
									}}
								>
									{i18next.t('KARA.APPLY_LYRICS_CLEANUP')}&nbsp;
									<Tooltip title={i18next.t('KARA.APPLY_LYRICS_CLEANUP_TOOLTIP')}>
										<QuestionCircleOutlined />
									</Tooltip>
								</Checkbox>
							)}
							{this.state.subfile?.length > 0 && this.props.kara?.kid && (
								<div style={{ marginTop: '1em' }}>
									<OpenLyricsFileButton kara={this.props.kara} />
								</div>
							)}
						</Col>
					</Row>
				</Form.Item>
				<Divider orientation="left">{i18next.t('KARA.SECTIONS.PARENTS')}</Divider>
				<Paragraph style={{ marginLeft: '200px' }}>{i18next.t('KARA.DESC.PARENTS')}</Paragraph>
				<Paragraph style={{ marginLeft: '200px' }}>{i18next.t('KARA.DESC.PARENTS_PUBLIC')}</Paragraph>
				<Form.Item
					label={
						<span>
							{i18next.t('KARA.PARENTS')}&nbsp;
							<Tooltip title={i18next.t('KARA.PARENTS_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 12 }}
					name="parents"
				>
					<Select
						showSearch
						mode="multiple"
						onSearch={this.search}
						onChange={this.onParentKaraChange}
						showArrow={false}
						filterOption={false}
						options={this.state.karaSearch}
						tagRender={this.tagRender}
					/>
				</Form.Item>
				<Divider orientation="left">{i18next.t('KARA.SECTIONS.TITLES')}</Divider>
				<Paragraph style={{ marginLeft: '200px' }}>{i18next.t('KARA.DESC.TITLES')}</Paragraph>
				<Paragraph style={{ marginLeft: '200px' }}>{i18next.t('KARA.DESC.TITLES_DEFAULT_LANGUAGE')}</Paragraph>
				<Form.Item
					hasFeedback
					label={
						<span>
							{i18next.t('KARA.TITLE')}&nbsp;
							<Tooltip title={i18next.t('KARA.TITLE_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					rules={[
						{
							required: !this.state.titles || Object.keys(this.state.titles).length === 0,
							message: i18next.t('KARA.TITLE_REQUIRED'),
						},
					]}
					name="titles"
				></Form.Item>
				<LanguagesList
					value={this.state.titles}
					onFieldIsTouched={isFieldTouched =>
						this.state.titlesIsTouched !== true && this.setState({ titlesIsTouched: isFieldTouched })
					}
					onChange={titles => {
						this.setState({ titles });
						this.formRef.current.validateFields(['titles']);
					}}
					defaultLanguage={this.state.defaultLanguage}
					onDefaultLanguageSelect={defaultLanguage => this.setState({ defaultLanguage })}
				/>
				<Paragraph style={{ marginLeft: '200px' }}>{i18next.t('KARA.DESC.ALIASES')}</Paragraph>
				<Form.Item
					label={
						<span>
							{i18next.t('KARA.ALIASES')}&nbsp;
							<Tooltip title={i18next.t('KARA.ALIASES_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					name="titles_aliases"
				>
					<EditableGroupAlias
						onChange={aliases => this.formRef.current?.setFieldsValue({ titles_aliases: aliases })}
					/>
				</Form.Item>
				<Divider orientation="left">{i18next.t('KARA.SECTIONS.IDENTITY')}</Divider>
				<Form.Item
					label={i18next.t('TAG_TYPES.LANGS_other')}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 7 }}
					rules={[
						{
							required: true,
							message: i18next.t('KARA.LANGUAGES_REQUIRED'),
						},
					]}
					name="langs"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={5}
						onChange={tags => this.formRef.current.setFieldsValue({ langs: tags })}
					/>
				</Form.Item>
				<Form.Item
					label={
						<span>
							{i18next.t('TAG_TYPES.SERIES_other')}&nbsp;
							<Tooltip title={i18next.t('KARA.SERIES_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 14 }}
					rules={[
						{
							required: this.state.serieSingersRequired,
							message: i18next.t('KARA.SERIES_SINGERS_REQUIRED'),
						},
					]}
					name="series"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={1}
						onChange={tags => {
							this.formRef.current.setFieldsValue({ series: tags });
							this.onChangeSingersSeries();
						}}
					/>
				</Form.Item>
				<Form.Item
					label={
						<span>
							{i18next.t('TAG_TYPES.FRANCHISES_other')}&nbsp;
							<Tooltip title={i18next.t('KARA.FRANCHISES_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 14 }}
					name="franchises"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={18}
						onChange={tags => this.formRef.current.setFieldsValue({ franchises: tags })}
					/>
				</Form.Item>
				<Form.Item
					label={i18next.t('TAG_TYPES.SONGTYPES_other')}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 10, offset: 0 }}
					name="songtypes"
					rules={[
						{
							required: true,
							message: i18next.t('KARA.TYPE_REQUIRED'),
						},
					]}
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={3}
						checkboxes={true}
						onChange={tags => this.formRef.current.setFieldsValue({ songtypes: tags })}
					/>
				</Form.Item>
				<Form.Item
					label={
						<span>
							{i18next.t('KARA.ORDER')}&nbsp;
							<Tooltip title={i18next.t('KARA.ORDER_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ flex: '0 1 70px' }}
					name="songorder"
				>
					<InputNumber min={0} style={{ width: '100%' }} onPressEnter={this.submitHandler} />
				</Form.Item>
				<Form.Item
					label={
						<span>
							{i18next.t('TAG_TYPES.VERSIONS_other')}&nbsp;
							<Tooltip title={i18next.t('KARA.VERSIONS_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 10 }}
					name="versions"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={14}
						checkboxes={true}
						onChange={tags => this.formRef.current.setFieldsValue({ versions: tags })}
					/>
				</Form.Item>
				<Form.Item
					label={i18next.t('KARA.SINGERS_BY')}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 7 }}
					rules={[
						{
							required: this.state.serieSingersRequired,
							message: i18next.t('KARA.SERIES_SINGERS_REQUIRED'),
						},
					]}
					name="singers"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={2}
						onChange={tags => {
							this.formRef.current.setFieldsValue({ singer: tags });
							this.onChangeSingersSeries();
						}}
					/>
				</Form.Item>
				<Form.Item
					label={i18next.t('KARA.SINGERGROUPS_BY')}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 7 }}
					rules={[
						{
							required: this.state.serieSingersRequired,
							message: i18next.t('KARA.SERIES_SINGERS_REQUIRED'),
						},
					]}
					name="singergroups"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={17}
						onChange={tags => {
							this.formRef.current.setFieldsValue({ singergroup: tags });
							this.onChangeSingersSeries();
						}}
					/>
				</Form.Item>
				<Form.Item
					label={
						<span>
							{i18next.t('KARA.SONGWRITERS_BY')}&nbsp;
							<Tooltip title={i18next.t('KARA.SONGWRITERS_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 7 }}
					name="songwriters"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={8}
						onChange={tags => this.formRef.current.setFieldsValue({ songwriters: tags })}
					/>
				</Form.Item>
				<Form.Item
					label={
						<span>
							{i18next.t('KARA.CREATORS_BY')}&nbsp;
							<Tooltip title={i18next.t('KARA.CREATORS_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 7 }}
					name="creators"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={4}
						onChange={tags => this.formRef.current.setFieldsValue({ creators: tags })}
					/>
				</Form.Item>
				<Form.Item
					hasFeedback
					label={
						<span>
							{i18next.t('KARA.YEAR')}&nbsp;
							<Tooltip title={i18next.t('KARA.YEAR_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 2 }}
					name="year"
				>
					<InputNumber
						required={true}
						min={0}
						max={new Date().getFullYear()}
						placeholder="Year"
						style={{ width: '100%' }}
						onPressEnter={this.submitHandler}
					/>
				</Form.Item>
				<Divider orientation="left">{i18next.t('KARA.SECTIONS.CATEGORIZATION')}</Divider>
				<Form.Item
					label={
						<span>
							{i18next.t('TAG_TYPES.COLLECTIONS_other')}&nbsp;
							<Tooltip title={i18next.t('KARA.COLLECTIONS_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 10, offset: 0 }}
					name="collections"
					rules={[
						{
							required: true,
							message: i18next.t('KARA.COLLECTIONS_REQUIRED'),
						},
					]}
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={16}
						checkboxes={true}
						onChange={tags => this.formRef.current.setFieldsValue({ collections: tags })}
					/>
				</Form.Item>

				<Form.Item
					label={
						<span>
							{i18next.t('TAG_TYPES.FAMILIES_other')}&nbsp;
							<Tooltip title={i18next.t('KARA.FAMILIES_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 10 }}
					name="families"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={10}
						checkboxes={true}
						onChange={tags => this.formRef.current.setFieldsValue({ families: tags })}
					/>
				</Form.Item>
				<Form.Item
					label={i18next.t('TAG_TYPES.PLATFORMS_other')}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 10 }}
					name="platforms"
				>
					<Collapse
						bordered={false}
						defaultActiveKey={
							this.props.kara?.platforms.length > 0 || this.state.parentKara?.platforms.length > 0
								? ['1']
								: []
						}
					>
						<Panel header={i18next.t('SHOW-HIDE')} key="1" forceRender={true}>
							<EditableTagGroup
								value={this.props.kara?.platforms || this.state.parentKara?.platforms}
								form={this.formRef.current}
								tagType={13}
								checkboxes={true}
								onChange={tags => this.formRef.current.setFieldsValue({ platforms: tags })}
							/>
						</Panel>
					</Collapse>
				</Form.Item>
				<Form.Item
					label={i18next.t('TAG_TYPES.GENRES_other')}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 10 }}
					name="genres"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={12}
						checkboxes={true}
						onChange={tags => this.formRef.current.setFieldsValue({ genres: tags })}
					/>
				</Form.Item>
				<Form.Item
					label={i18next.t('TAG_TYPES.ORIGINS_other')}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 10 }}
					name="origins"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={11}
						checkboxes={true}
						onChange={tags => this.formRef.current.setFieldsValue({ origins: tags })}
					/>
				</Form.Item>
				<Form.Item
					label={i18next.t('TAG_TYPES.MISC_other')}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 10 }}
					name="misc"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={7}
						checkboxes={true}
						onChange={tags => this.formRef.current.setFieldsValue({ misc: tags })}
					/>
				</Form.Item>
				<Form.Item
					label={i18next.t('TAG_TYPES.WARNINGS_other')}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 10 }}
					name="warnings"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={15}
						checkboxes={true}
						onChange={tags => this.formRef.current.setFieldsValue({ warnings: tags })}
					/>
				</Form.Item>
				<Form.Item
					label={
						<span>
							{i18next.t('TAG_TYPES.GROUPS_other')}&nbsp;
							<Tooltip title={i18next.t('KARA.GROUPS_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 10 }}
					name="groups"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={9}
						checkboxes={true}
						onChange={tags => this.formRef.current.setFieldsValue({ groups: tags })}
					/>
				</Form.Item>
				<Divider orientation="left">{i18next.t('KARA.SECTIONS.META')}</Divider>
				<Form.Item
					className="wrap-label"
					label={
						<span>
							{i18next.t('KARA.FROM_DISPLAY_TYPE')}&nbsp;
							<Tooltip title={i18next.t('KARA.FROM_DISPLAY_TYPE_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 7 }}
					name="from_display_type"
				>
					<Select>{Object.keys(tagTypes).concat('').map(this.mapTagTypesToSelectOption)}</Select>
				</Form.Item>
				<Form.Item
					className="wrap-label"
					label={
						<span>
							{i18next.t('KARA.ANNOUNCE_POSITION')}&nbsp;
							<Tooltip title={i18next.t('KARA.ANNOUNCE_POSITION_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 7 }}
				>
					{typeof this.state.announcePosition !== 'undefined' ? (
						<div>
							<Row>
								<Card title="Karaoke Mugen Player" size="small" style={{ width: '200px' }}>
									<Radio.Group
										name="announce_position"
										value={this.state.announcePosition}
										onChange={e => this.setState({ announcePosition: e.target.value })}
										style={{ width: '100%' }}
									>
										<Row
											style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}
										>
											<Radio value="Left,Top" />
											<Radio value="Center,Top" />
											<Radio value="Right,Top" />
										</Row>
										<Row
											style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}
										>
											<Radio value="Left,Center" />
											<Radio value="Center,Center" />
											<Radio value="Right,Center" />
										</Row>
										<Row
											style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}
										>
											<Radio value="Left,Bottom" />
											<Radio value="Center,Bottom" />
											<Radio value="Right,Bottom" />
										</Row>
									</Radio.Group>
								</Card>
							</Row>
							<br />
							<Row>
								<Button onClick={() => this.setState({ announcePosition: undefined })}>
									<DeleteOutlined />
									{i18next.t('KARA.ANNOUNCE_POSITION_SELECTION.UNSET')}
								</Button>
							</Row>
						</div>
					) : (
						<Button onClick={() => this.setState({ announcePosition: null })}>
							{i18next.t('KARA.ANNOUNCE_POSITION_SELECTION.SET')}
						</Button>
					)}
				</Form.Item>
				<Form.Item
					label={
						<span>
							{i18next.t('KARA.AUTHORS_BY')}&nbsp;
							<Tooltip title={i18next.t('KARA.KARA_AUTHORS_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 7 }}
					rules={[
						{
							required: true,
							message: i18next.t('KARA.KARA_AUTHORS_REQUIRED'),
						},
					]}
					name="authors"
				>
					<EditableTagGroup
						form={this.formRef.current}
						tagType={6}
						onChange={tags => this.formRef.current.setFieldsValue({ author: tags })}
					/>
				</Form.Item>
				<Form.Item
					hasFeedback
					label={
						<span>
							{i18next.t('KARA.COMMENT')}&nbsp;
							<Tooltip title={i18next.t('KARA.COMMENT_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 8 }}
					rules={[
						{
							required: false,
						},
					]}
					name="comment"
				>
					<Input placeholder={i18next.t('KARA.COMMENT')} onKeyPress={this.submitHandler} />
				</Form.Item>
				<Form.Item
					label={
						<span>
							{i18next.t('KARA.IGNOREHOOKS')}&nbsp;
							<Tooltip title={i18next.t('KARA.IGNOREHOOKS_TOOLTIP')}>
								<QuestionCircleOutlined />
							</Tooltip>
						</span>
					}
					valuePropName="checked"
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 8 }}
					rules={[
						{
							required: false,
						},
					]}
					name="ignore_hooks"
				>
					<Checkbox />
				</Form.Item>
				{this.state.repositoriesValue ? (
					<Form.Item
						label={i18next.t('KARA.REPOSITORY')}
						labelCol={{ flex: '0 1 220px' }}
						wrapperCol={{ span: 3 }}
						rules={[
							{
								required: true,
								message: i18next.t('KARA.REPOSITORY_REQUIRED'),
							},
						]}
						name="repository"
					>
						<Select
							disabled={this.props.kara?.repository !== undefined}
							placeholder={i18next.t('KARA.REPOSITORY')}
						>
							{this.state.repositoriesValue.map(this.mapRepoToSelectOption)}
						</Select>
					</Form.Item>
				) : null}
				<Form.Item
					label={i18next.t('KARA.CREATED_AT')}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 8 }}
					name="created_at"
				>
					<label>
						{this.props.kara?.created_at ? new Date(this.props.kara?.created_at).toLocaleString() : null}
					</label>
				</Form.Item>
				<Form.Item
					label={i18next.t('KARA.MODIFIED_AT')}
					labelCol={{ flex: '0 1 220px' }}
					wrapperCol={{ span: 8 }}
					name="modified_at"
				>
					<label>
						{this.props.kara?.modified_at ? new Date(this.props.kara?.modified_at).toLocaleString() : null}
					</label>
				</Form.Item>
				<div style={{ marginLeft: '220px', marginBottom: '1em' }}>
					{this.state.errors.map(error => (
						<div key={error}>
							<label className="ant-form-item-explain-error">{error}</label>
						</div>
					))}
				</div>
				<Form.Item>
					<Button style={{ marginLeft: '14em', marginRight: '9em' }} onClick={this.previewHooks}>
						{i18next.t('KARA.PREVIEW_HOOKS')}
					</Button>
					<Button type="primary" htmlType="submit">
						{i18next.t('SUBMIT')}
					</Button>
				</Form.Item>
				{this.state.repositoriesValue && this.props.kara?.repository ? (
					<>
						<Divider orientation="left">{i18next.t('KARA.COPY_SONG')}</Divider>
						<Form.Item
							hasFeedback
							label={i18next.t('KARA.REPOSITORY')}
							labelCol={{ flex: '0 1 220px' }}
							wrapperCol={{ span: 8 }}
						>
							<Select
								placeholder={i18next.t('KARA.REPOSITORY')}
								onChange={(value: string) => this.setState({ repoToCopySong: value })}
							>
								{this.state.repositoriesValue
									.filter(value => value !== this.props.kara?.repository)
									.map(this.mapRepoToSelectOption)}
							</Select>
						</Form.Item>

						<Form.Item wrapperCol={{ span: 8, offset: 3 }} style={{ textAlign: 'right' }}>
							<Button
								disabled={!this.state.repoToCopySong}
								type="primary"
								danger
								onClick={() => this.props.handleCopy(this.props.kara?.kid, this.state.repoToCopySong)}
							>
								{i18next.t('KARA.COPY_SONG')}
							</Button>
						</Form.Item>

						<Divider orientation="left">{i18next.t('KARA.DELETE_KARA')}</Divider>
						<Form.Item wrapperCol={{ span: 8, offset: 3 }} style={{ textAlign: 'center' }}>
							<Alert
								style={{ textAlign: 'left', marginBottom: '20px' }}
								message={i18next.t('WARNING')}
								description={i18next.t('CONFIRM_SURE')}
								type="warning"
							/>

							<Button type="primary" danger onClick={this.handleDelete}>
								{i18next.t('KARA.DELETE_KARA')}
							</Button>
						</Form.Item>
					</>
				) : null}
			</Form>
		);
	}
}

export default KaraForm;
